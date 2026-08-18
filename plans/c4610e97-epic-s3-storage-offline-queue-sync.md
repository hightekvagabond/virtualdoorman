# Plan: S3 storage, offline queue & sync

Ticket: c4610e97 — epic: S3 storage, offline queue & sync
Branch: `ticket/c4610e97-epic-s3-storage-offline-queue-sync` (from `dev` @ `0f0acc5`)

## Context

The monorepo scaffold (PR #1) is merged: Yarn 4 workspaces, one RN app at
`apps/doorman` (Android-only, RN 0.87, TS strict), a runtime-free
`@virtualdoorman/types` package that already models `Entry`, `Config`,
`Command`, and `Property`, a validated `env.ts` accessor, and CI running
`yarn lint && yarn typecheck && yarn test`.

This epic delivers **all photo/data persistence**: entries are written to
local storage first (the tablet is fully offline-capable), then uploaded to S3
when connectivity returns, with per-entry status tracking and exponential
backoff. The kiosk capture epic (69897ede) runs on a parallel branch cut from
the same `dev` commit — so this epic ships a **self-contained service layer
with one narrow entry point** (`persistEntry(...)`) and touches shared files
(`App.tsx`, locales, jest setup) as lightly as possible to keep the eventual
merge cheap. No capture UI is built here.

**Done when (automated):** entries captured offline queue correctly (verified
by unit tests over mocked fs/S3/NetInfo), upload happens on (mocked) reconnect,
and the S3 key layout produced by the key helpers matches the spec exactly
(golden-string tests). On-device verification is under **Human verification**.

## Spec reconciliation (existing code vs. this ticket's spec)

Two places where the scaffold's `packages/types` drifted from this spec; the
spec wins because the done-when gate is "S3 layout matches spec exactly":

1. **Key shape.** `PropertyPrefixInput`'s doc comment describes
   `<prefix>/<device_id>/<YYYY-MM-DD>/<entry_id>/...`. The spec is
   `<property>/YYYY/MM/DD/<entry-uuid>/` — date as three path segments, **no
   device segment**. The key helpers implement the spec; the stale comment on
   `PropertyPrefixInput` is corrected (types-only doc change, no shape change —
   `device_id` stays in the input type because it is stamped into `data.json`,
   just not into the key).
2. **data.json shape.** The scaffold's `EntryData` wraps the entry as
   `{ schema_version, entry }`, but the spec lists the v1 fields flat
   (`entry_id`, `property`, …, `booking_system`). Resolved per the open
   question below (recommended default: flatten — `data.json` *is* the `Entry`
   object plus a top-level `schema_version: 1`; `EntryData` becomes
   `Entry & { schema_version: 1 }` and its doc comment updated).

`config.json` and `commands/` appear in the layout spec but are produced by
the provisioning script and the admin app respectively; here they exist only
as key-builder constants (`configKey(property)`, `commandsPrefix(property)`)
so every ticket derives keys from one module.

## Approach

### Where the code lives

All in the app: `apps/doorman/src/storage/` (local persistence + queue) and
`apps/doorman/src/sync/` (network, S3, upload engine). `packages/types` stays
runtime-free — runtime helpers cannot go there. Pure logic (key builder,
backoff schedule, queue state machine, `data.json` serializer) is kept in
dependency-free modules so Jest covers it without a device.

```
apps/doorman/src/
├── storage/
│   ├── paths.ts          # S3 key builder + mirrored local dir layout (pure)
│   ├── entrySerializer.ts# Entry -> data.json v1 bytes; parse + validate back (pure)
│   ├── entryStore.ts     # write-local-first: photos moved in, data.json written atomically
│   ├── queue.ts          # persistent queue: boot-time disk scan, status transitions
│   └── fs.ts             # thin typed façade over the RN filesystem lib (the only file importing it)
├── sync/
│   ├── network.ts        # NetInfo wrapper: isOnline() + onOnline(cb) events
│   ├── credentials.ts    # CredentialsProvider seam (Keystore impl lands in the security epic)
│   ├── s3Client.ts       # configured AWS SDK v3 client; put/get only — delete is not exported
│   ├── backoff.ts        # exponential backoff schedule with jitter (pure)
│   ├── uploader.ts       # one entry -> S3: photos first (multipart), data.json last
│   └── syncEngine.ts     # orchestrator: queue x network -> drain, retry, status updates
├── device/
│   └── identity.ts       # device_id (persisted, pairing overwrites later) + app_version
└── index-side changes: App.tsx boot hook, jest.setup.js mocks, locales
```

### 1. S3 key layout (`storage/paths.ts`)

Single source of truth for the spec layout:

```
<property>/config.json
<property>/commands/
<property>/YYYY/MM/DD/<entry_id>/id-front.jpg
<property>/YYYY/MM/DD/<entry_id>/id-back.jpg
<property>/YYYY/MM/DD/<entry_id>/selfie.jpg
<property>/YYYY/MM/DD/<entry_id>/data.json
```

- `entryPrefix({ property, timestamp_utc, entry_id })` derives `YYYY/MM/DD`
  from the **UTC** instant (zero-padded, from the ISO string — no local-time
  drift).
- Photo slots are a const tuple `['id-front', 'id-back', 'selfie']` shared by
  the local layout, the uploader, and the tests.
- The local queue directory mirrors the same relative layout under the app's
  private files dir (`<filesDir>/queue/<property>/YYYY/MM/DD/<entry_id>/…`), so
  "what's on disk" maps 1:1 to "what will be in S3" and recovery is a directory
  walk.

### 2. Write-local-first (`storage/entryStore.ts`)

Public API of the whole epic — what the capture flow calls after its last
screen:

```ts
persistEntry(input: {
  property: string;
  photos: { idFront: string; idBack: string; selfie: string }; // local temp file paths
  ocr_raw: string | null;
  form_fields: EntryFormFields;
  cv_confidence: number;
  timestamp_utc: string; // injected, not read from a clock here — testable
}): Promise<Entry>
```

- Generates `entry_id` (UUID v4 via `react-native-get-random-values` + `uuid`),
  stamps `property`, `device_id`, `app_version`, `upload_status: 'queued'`,
  `booking_system: null`.
- **Crash-safe ordering:** create entry dir → *move* the three photos in →
  write `data.json` to a temp name and rename into place. `data.json`'s
  presence is the commit marker; the boot-time scan ignores dirs without it
  (and sweeps ones older than a grace period), so a mid-capture crash never
  yields a half-entry that uploads.
- Status updates rewrite `data.json` atomically (temp + rename).

### 3. Queue (`storage/queue.ts`)

- Source of truth is the filesystem — **no database**. On boot, walk the queue
  dir, parse each `data.json`, build an in-memory index ordered
  oldest-first (by `timestamp_utc`, tie-broken by `entry_id`).
- Exposes `pending()` (status `queued` or `failed`), `markUploaded(id)`,
  `markFailed(id)`, and an `onEnqueued` event the sync engine subscribes to.
- Entries are **never deleted by the queue** in v1 — after upload they are
  marked `uploaded` and kept locally (retention/cleanup is a deliberate
  non-goal here; see Open questions).

### 4. Network monitoring (`sync/network.ts`)

`@react-native-community/netinfo`, wrapped so the rest of the code never
imports NetInfo directly (same pattern as `env.ts` wrapping
`react-native-config`). Treats `isInternetReachable === false` as offline;
fires a single debounced `online` event on transition to reachable.

### 5. S3 client (`sync/s3Client.ts`, `sync/credentials.ts`)

- **AWS SDK v3** (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`), matching the
  provisioning epic ("AWS SDK v3, already in monorepo deps"). RN needs two
  polyfills imported once at app entry: `react-native-get-random-values` and
  `react-native-url-polyfill/auto`.
- Photos upload via `lib-storage`'s `Upload` (multipart per spec; bodies read
  through the fs façade — ID photos are single-digit MB, in-memory
  `Uint8Array` bodies are fine and keep the fs lib's API surface small).
  `data.json` uploads via plain `PutObject` with
  `ContentType: application/json`.
- **The module does not export delete.** Only `PutObject`/`GetObject`(+ the
  multipart commands `lib-storage` issues) are constructed anywhere; a comment
  block states the invariant (bucket lifecycle rules own retention) and a test
  asserts no `DeleteObject`/`DeleteObjects` command is ever sent.
- `CredentialsProvider` seam: an interface
  (`getCredentials(): Promise<{ accessKeyId, secretAccessKey, region, bucket } | null>`)
  with a single in-memory implementation whose values are set at runtime
  (`setCredentials(...)`). QR pairing + Android Keystore persistence land in
  the pairing/security epics; until then the sync engine idles when
  credentials are `null`. No credentials in `.env.*` files or the repo, ever.

### 6. Upload engine (`sync/uploader.ts`, `sync/syncEngine.ts`, `sync/backoff.ts`)

- **Per entry:** upload `id-front.jpg`, `id-back.jpg`, `selfie.jpg`, then
  `data.json` **last** — its presence in S3 marks the entry complete, so a
  partially-uploaded entry is never mistaken for a finished one. The S3 copy of
  `data.json` is stamped `upload_status: 'uploaded'` at serialization time (the
  local copy is the live status record; an S3 object saying "queued" forever
  would be nonsense). Re-uploads are idempotent: same keys, `PutObject`
  overwrites, nothing is ever deleted.
- **Retry:** exponential backoff with full jitter — base 2 s, factor 2, cap
  5 min. After 5 consecutive failures the entry is marked `failed` (visible
  status) but is **not abandoned**: every `online` transition and every app
  start resets the schedule and retries. `failed` means "needs attention /
  will retry", never "dropped".
- **Engine:** started once from app boot. Drains oldest-first, one entry at a
  time (serial keeps bandwidth, battery, and interleaved-failure handling
  simple on a tablet that captures at human speed). Triggers: boot scan
  completion, `onEnqueued`, `online` event, backoff timer. Skips work while
  offline or credential-less. A small injected `Clock`/timer interface keeps
  the backoff loop fake-timer-testable.

### 7. Device identity (`device/identity.ts`)

- `device_id`: UUID v4 generated on first boot, persisted to a file in app
  storage; the pairing epic will overwrite it with the paired identity.
  A `// FUTURE:` comment marks the seam.
- `app_version`: `versionName` via `react-native-device-info`
  (`getVersion()`), wrapped here so nothing else imports the lib.

### 8. App wiring (minimal, merge-friendly)

- `index.js`: add the two polyfill imports at the very top.
- `App.tsx`: one `useEffect` calling `startSync()` from `sync/syncEngine`
  (guarded so tests don't spin timers), plus a `// FUTURE:` note that the
  capture flow calls `persistEntry(...)`. No visual changes — keeps the
  parallel capture branch's `App.tsx` conflict trivial.
- Locales: this epic adds **no user-facing screens**; upload-failure UI copy
  belongs to the capture/UX epic. No `en.json`/`es.json` changes (avoids
  cross-branch conflicts).

### 9. Dependencies added (`apps/doorman`)

Pinned per repo convention, hoisted by Yarn 4:

- `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`
- `@react-native-community/netinfo`
- `@dr.pogodin/react-native-fs` (maintained fork; see Open questions)
- `react-native-get-random-values`, `react-native-url-polyfill`, `uuid`
- `react-native-device-info`
- dev: `aws-sdk-client-mock` (typed S3 mocking in Jest), `@types/uuid` if needed

All native modules autolink; no manual Gradle edits expected beyond what
autolinking does. `jest.setup.js` gains mocks for netinfo (ships its own jest
mock), the fs lib, device-info, and get-random-values.

## Files to change

New:
- `apps/doorman/src/storage/{paths,entrySerializer,entryStore,queue,fs}.ts`
- `apps/doorman/src/sync/{network,credentials,s3Client,backoff,uploader,syncEngine}.ts`
- `apps/doorman/src/device/identity.ts`
- `apps/doorman/__tests__/` — see Tests below
- `plans/c4610e97-epic-s3-storage-offline-queue-sync.md` (this file)

Modified:
- `apps/doorman/package.json`, root `yarn.lock` — deps above
- `apps/doorman/index.js` — polyfill imports
- `apps/doorman/src/App.tsx` — boot hook only
- `apps/doorman/jest.setup.js` — native-module mocks
- `packages/types/src/entry.ts` — `EntryData` flattened per spec (pending the
  open question); doc comments updated
- `packages/types/src/property.ts` — stale key-shape comment corrected
- `README.md` — short "Offline queue & S3 sync" section: layout diagram,
  status lifecycle, the never-delete invariant, credentials seam

## Tests to add

All Jest, in `apps/doorman/__tests__/`, running on plain Node with the mocks
above (repo convention — CI has no device):

- `paths.test.ts` — **golden strings**: exact spec keys for a fixed
  property/timestamp/uuid, incl. zero-padded month/day, UTC (not local) date
  derivation, `config.json` and `commands/` constants.
- `entrySerializer.test.ts` — `data.json` v1 has exactly the spec fields
  (+`schema_version` per the resolved question), round-trips, rejects garbage
  on parse (corrupt file on the boot scan → skipped + logged, not a crash).
- `entryStore.test.ts` — photos moved (not copied), temp+rename atomicity,
  crash-simulation: dir without `data.json` is not enqueued.
- `queue.test.ts` — boot scan rebuilds the queue oldest-first; status
  transitions queued→uploaded / queued→failed→queued persist across a
  simulated restart.
- `backoff.test.ts` — schedule values, cap, jitter bounds, reset.
- `uploader.test.ts` (aws-sdk-client-mock) — upload order with `data.json`
  strictly last; S3 copy stamped `uploaded`; photo uploads go through
  multipart `Upload`; **no Delete command is ever issued**; mid-entry failure
  leaves local status retryable.
- `syncEngine.test.ts` (fake timers) — offline: nothing uploads; `online`
  event drains the queue; failure → backoff → retry → success; 5 failures →
  `failed` but reconnect retries again; no credentials → idle, no throw.
- `network.test.ts` — reachability mapping + single debounced online event.

CI (`yarn lint && yarn typecheck && yarn test`) must stay green; the types
package change is covered by its `tsc --noEmit` gate.

## Human verification

Things only a human with a device and an AWS account can do — not part of the
automated done-when:

- Sideload on a physical Android tablet; capture a synthetic entry (dev
  harness or the capture branch once merged) in **airplane mode**; confirm the
  entry lands in local storage with `upload_status: queued`.
- Re-enable connectivity; confirm upload starts without app restart and the
  objects appear in S3 under exactly
  `<property>/YYYY/MM/DD/<entry_id>/{id-front.jpg,id-back.jpg,selfie.jpg,data.json}`.
- Kill the app mid-upload, relaunch, confirm the entry resumes and completes.
- Verify with real scoped credentials from the provisioning script that
  uploads succeed and the app never attempts a delete (CloudTrail/S3 access
  logs show only Put/Get).

## Out of scope (other epics)

Capture UI/CV/OCR (parallel branch 69897ede), QR pairing and real credential
delivery, Android Keystore persistence (security epic), config.json polling
and commands/ handling (admin + polling tickets), provisioning script,
notifications, local retention/cleanup of uploaded entries.

## Open questions

- data.json shape: the scaffold's `EntryData` wraps the entry as
  `{ schema_version: 1, entry: {...} }`, but this ticket's spec lists the v1
  fields flat. Flatten so `data.json` is the `Entry` fields at top level plus
  `schema_version: 1`, updating `packages/types` accordingly? I recommend
  flattening — it matches the spec's field list while keeping an explicit
  schema version for future migrations.
- S3 client library: the spec allows aws-sdk or react-native-aws3. Use AWS SDK
  v3 (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`) with the two standard RN
  polyfills? I recommend SDK v3 — react-native-aws3 is unmaintained, and the
  provisioning epic already standardizes on SDK v3.
- Filesystem library: `react-native-fs` (original, effectively unmaintained),
  `@dr.pogodin/react-native-fs` (maintained fork, drop-in API), or
  `react-native-file-access`? I recommend `@dr.pogodin/react-native-fs`.
- Retry policy parameters: exponential backoff base 2 s, factor 2, cap 5 min,
  full jitter; mark `failed` after 5 consecutive failures but keep retrying on
  every reconnect and app start (never drop an entry)? I recommend exactly
  that.
- Upload concurrency: strictly serial, oldest entry first (simple, kind to
  tablet bandwidth/battery; capture rate is human-speed), vs. parallel
  uploads? I recommend serial oldest-first.
- Local copies after successful upload: keep entries on the tablet marked
  `uploaded` indefinitely in v1 (no local cleanup — S3 lifecycle only governs
  the bucket), deferring local retention to a later ticket? I recommend
  keeping them in v1, since local deletion policy deserves its own decision.
- `device_id` before pairing exists: generate a UUID v4 on first boot,
  persist it locally, and let the pairing epic overwrite it? I recommend yes.
- `app_version` source: add `react-native-device-info` (also useful to later
  epics) vs. a bespoke native constant? I recommend `react-native-device-info`.
- Credentials before pairing/security epics land: a `CredentialsProvider`
  interface with an in-memory, runtime-settable implementation (sync engine
  idles while credentials are absent; Keystore-backed provider arrives with
  the security epic)? I recommend that seam.
