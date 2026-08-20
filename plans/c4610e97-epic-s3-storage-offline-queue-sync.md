# Plan: S3 storage, offline queue & sync

Ticket: c4610e97 — epic: S3 storage, offline queue & sync
Branch: `ticket/c4610e97-epic-s3-storage-offline-queue-sync` (from `dev` @ `0f0acc5`)
Revision: 2 — all nine open questions from round 1 are answered; this plan
incorporates the answers and has no remaining open questions.

## Decisions from the requester (round-1 answers, 2026-08-20)

1. **data.json shape:** flattened. `data.json` is the `Entry` fields at top
   level plus `schema_version: 1`; `packages/types` updated accordingly.
2. **S3 client:** AWS SDK v3 (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`)
   with the two standard RN polyfills.
3. **Filesystem library:** `@dr.pogodin/react-native-fs` (maintained fork).
4. **Retry policy:** exponential backoff base 2 s, factor 2, cap 5 min, full
   jitter; `failed` after 5 consecutive failures but retried on every
   reconnect and app start — an entry is never dropped.
5. **Upload concurrency:** serial, oldest entry first. *Additionally:* the
   admin-side entry list must display **newest first** — the admin app is a
   different epic, but this epic records the decision and exposes a
   newest-first listing accessor on the queue so the convention is set here.
6. **Local retention (changed from the recommended default):** photos are
   retained on device **only until the upload is confirmed in S3 and the
   uploaded file's hash has been checked against the on-device hash**, then
   deleted locally (stolen-tablet ID-theft mitigation). An admin option allows
   retaining entries on device for X days after verification. Local deletion
   is configurable; S3 is still never deleted by the app.
7. **device_id:** UUID v4 generated on first boot, persisted locally; the
   pairing epic overwrites it later.
8. **app_version:** via `react-native-device-info`.
9. **Credentials:** `CredentialsProvider` interface with an in-memory,
   runtime-settable implementation; the sync engine idles while credentials
   are absent; the Keystore-backed provider arrives with the security epic.

## Context

The monorepo scaffold (PR #1) is merged: Yarn 4 workspaces, one RN app at
`apps/doorman` (Android-only, RN 0.87, TS strict), a runtime-free
`@virtualdoorman/types` package that already models `Entry`, `Config`,
`Command`, and `Property`, a validated `env.ts` accessor, and CI running
`yarn lint && yarn typecheck && yarn test`.

This epic delivers **all photo/data persistence**: entries are written to
local storage first (the tablet is fully offline-capable), then uploaded to S3
when connectivity returns, with per-entry status tracking, exponential
backoff, hash-verified uploads, and post-verification local deletion. The
kiosk capture epic (69897ede) runs on a parallel branch cut from the same
`dev` commit — so this epic ships a **self-contained service layer with one
narrow entry point** (`persistEntry(...)`) and touches shared files
(`App.tsx`, locales, jest setup) as lightly as possible to keep the eventual
merge cheap. No capture UI is built here.

**Done when (automated):** entries captured offline queue correctly (verified
by unit tests over mocked fs/S3/NetInfo), upload happens on (mocked)
reconnect, the S3 key layout produced by the key helpers matches the spec
exactly (golden-string tests), uploads are hash-verified before an entry is
marked `uploaded`, and verified entries are locally scrubbed per the retention
setting. On-device verification is under **Human verification**.

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
2. **data.json shape — decided: flatten.** The scaffold's `EntryData` wraps
   the entry as `{ schema_version, entry }`; per decision 1 it becomes
   `Entry & { schema_version: EntryDataSchemaVersion }` (`data.json` *is* the
   `Entry` object plus a top-level `schema_version: 1`), with doc comments
   updated. `packages/types` has no other consumers of `EntryData` yet, so
   this is a contained change covered by the types test.

`config.json` and `commands/` appear in the layout spec but are produced by
the provisioning script and the admin app respectively; here they exist only
as key-builder constants (`configKey(property)`, `commandsPrefix(property)`)
so every ticket derives keys from one module.

## Approach

### Where the code lives

All in the app: `apps/doorman/src/storage/` (local persistence + queue +
retention) and `apps/doorman/src/sync/` (network, S3, upload engine).
`packages/types` stays runtime-free — runtime helpers cannot go there. Pure
logic (key builder, backoff schedule, queue state machine, `data.json`
serializer, composite-checksum math, retention eligibility) is kept in
dependency-free modules so Jest covers it without a device.

```
apps/doorman/src/
├── storage/
│   ├── paths.ts          # S3 key builder + mirrored local dir layout (pure)
│   ├── entrySerializer.ts# Entry -> data.json v1 bytes; parse + validate back (pure)
│   ├── entryStore.ts     # write-local-first: photos moved in, data.json written atomically
│   ├── queue.ts          # persistent queue: boot-time disk scan, status transitions
│   ├── retention.ts      # post-verification local scrub + configurable retain-X-days sweep
│   └── fs.ts             # thin typed façade over @dr.pogodin/react-native-fs (the only file importing it)
├── sync/
│   ├── network.ts        # NetInfo wrapper: isOnline() + onOnline(cb) events
│   ├── credentials.ts    # CredentialsProvider seam (Keystore impl lands in the security epic)
│   ├── s3Client.ts       # configured AWS SDK v3 client; put/head/get only — delete is not exported
│   ├── backoff.ts        # exponential backoff schedule with jitter (pure)
│   ├── checksums.ts      # SHA-256 helpers: base64 encoding, multipart composite checksum (pure)
│   ├── uploader.ts       # one entry -> S3: photos first (multipart), data.json last, then verify
│   └── syncEngine.ts     # orchestrator: queue x network -> drain, retry, verify, scrub, status updates
├── device/
│   └── identity.ts       # device_id (persisted, pairing overwrites later) + app_version
└── index-side changes: App.tsx boot hook, jest.setup.js mocks
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
  compute each file's SHA-256 (fs façade `hash()`) → write `data.json` and a
  local sidecar `meta.local.json` (see below) each to a temp name and rename
  into place. `data.json`'s presence is the commit marker; the boot-time scan
  ignores dirs without it (and sweeps ones older than a grace period), so a
  mid-capture crash never yields a half-entry that uploads.
- **Sidecar `meta.local.json` (local only, never uploaded):** per-file SHA-256
  hashes computed at persist time, consecutive-failure count, `verified_at`,
  and scrub state. Keeping this out of `data.json` means the uploaded
  `data.json` contains exactly the spec's v1 fields (+`schema_version`), while
  local bookkeeping can evolve freely.
- Status updates rewrite `data.json` atomically (temp + rename).

### 3. Queue (`storage/queue.ts`)

- Source of truth is the filesystem — **no database**. On boot, walk the queue
  dir, parse each `data.json` + sidecar, build an in-memory index.
- Drain order is **oldest-first** (by `timestamp_utc`, tie-broken by
  `entry_id`) per decision 5.
- Exposes `pending()` (status `queued` or `failed`, oldest-first),
  `listAll()` (**newest-first** — the display convention decided for the
  admin side; unused by this epic's engine but established and tested here),
  `markUploaded(id)`, `markFailed(id)`, and an `onEnqueued` event the sync
  engine subscribes to.
- Corrupt `data.json` on the boot scan → entry skipped + logged, never a
  crash; a missing sidecar is rebuilt by re-hashing the local files.

### 4. Network monitoring (`sync/network.ts`)

`@react-native-community/netinfo`, wrapped so the rest of the code never
imports NetInfo directly (same pattern as `env.ts` wrapping
`react-native-config`). Treats `isInternetReachable === false` as offline;
fires a single debounced `online` event on transition to reachable.

### 5. S3 client (`sync/s3Client.ts`, `sync/credentials.ts`)

- **AWS SDK v3** (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`) per
  decision 2, matching the provisioning epic. RN needs two polyfills imported
  once at app entry: `react-native-get-random-values` and
  `react-native-url-polyfill/auto`.
- Photos upload via `lib-storage`'s `Upload` (multipart per spec) with a
  **fixed 5 MiB part size** — fixing the part size is what makes the
  multipart composite checksum locally reproducible (§6a). `data.json`
  uploads via plain `PutObject` with `ContentType: application/json`.
- **The module exports put/head/get only — no delete.** Only
  `PutObject`/`HeadObject`/`GetObject` (+ the multipart commands `lib-storage`
  issues) are constructed anywhere; a comment block states the invariant
  (bucket lifecycle rules own S3 retention; local scrubbing in §6b is
  device-side only) and a test asserts no `DeleteObject`/`DeleteObjects`
  command is ever sent.
- **`CredentialsProvider` seam (decision 9):** an interface
  (`getCredentials(): Promise<{ accessKeyId, secretAccessKey, region, bucket } | null>`)
  with a single in-memory implementation whose values are set at runtime
  (`setCredentials(...)`). QR pairing + Android Keystore persistence land in
  the pairing/security epics; until then the sync engine idles when
  credentials are `null`. No credentials in `.env.*` files or the repo, ever.

### 6. Upload engine (`sync/uploader.ts`, `sync/syncEngine.ts`, `sync/backoff.ts`, `sync/checksums.ts`)

- **Per entry:** upload `id-front.jpg`, `id-back.jpg`, `selfie.jpg`, then
  `data.json` **last** — its presence in S3 marks the entry complete, so a
  partially-uploaded entry is never mistaken for a finished one. The S3 copy of
  `data.json` is stamped `upload_status: 'uploaded'` at serialization time (the
  local copy is the live status record; an S3 object saying "queued" forever
  would be nonsense). Re-uploads are idempotent: same keys, `PutObject`
  overwrites, nothing is ever deleted from S3.

#### 6a. Hash verification (decision 6 — required before `uploaded`)

An entry only transitions to `uploaded` after every one of its four objects is
**confirmed in S3 with a hash matching the on-device hash**:

- Every upload sends SHA-256 checksums (`ChecksumAlgorithm: 'SHA256'` /
  precomputed `ChecksumSHA256` on `PutObject`), so S3 itself rejects any
  transfer whose bytes don't match — corruption cannot land silently.
- After the four uploads succeed, the uploader issues `HeadObject`
  (`ChecksumMode: 'ENABLED'`) per object and compares (a) `ContentLength`
  against the local file size and (b) the returned `ChecksumSHA256` against
  the locally computed value from the sidecar — direct base64 SHA-256 for
  single-part objects, or the multipart **composite** checksum
  (SHA-256 of the concatenated part digests, `-<partCount>` suffix) computed
  locally by `checksums.ts` from the same fixed 5 MiB part size.
- Any mismatch is treated as an upload failure: status stays retryable, the
  objects are re-uploaded on the next attempt (idempotent overwrite), and the
  entry is never scrubbed locally.
- Only after all four verifications pass: local `data.json` →
  `upload_status: 'uploaded'`, sidecar stamped `verified_at`.

#### 6b. Local retention & scrub (`storage/retention.ts`, decision 6)

- **New `Config` field:** `local_retention_days: number` — how long a
  **verified** entry's sensitive files stay on the tablet. **Default `0`**
  (scrub immediately after hash-verified upload), matching the requester's
  stolen-tablet concern; admins raise it via the admin app (config-polling
  epic delivers live updates — this epic reads the value through the existing
  config accessor with the in-repo default).
- **What scrubbing means:** for a verified entry past its retention window,
  delete the three photos **and** replace `data.json` with a small redacted
  tombstone (`entry_id`, `property`, `timestamp_utc`, `upload_status:
  'uploaded'`, `schema_version`, hashes, `scrubbed_at`) — `ocr_raw` and
  `form_fields` hold the same ID data as the photos, so retaining them would
  defeat the purpose. The tombstone keeps the queue's bookkeeping and the
  future admin views working without any PII on device.
- **Never scrubbed:** anything not hash-verified. `queued`/`failed` entries
  keep their photos indefinitely — durability beats disk space.
- **Triggers:** immediately after each successful verification (the common,
  `local_retention_days = 0` path), on boot scan, and on a coarse daily timer
  (covers entries whose window elapses while the app is running).
- Scrub is local-only. The S3 objects are untouched — the app still never
  issues a delete against the bucket.

#### 6c. Retry & scheduling (decisions 4 & 5)

- **Retry:** exponential backoff with full jitter — base 2 s, factor 2, cap
  5 min. After 5 consecutive failures the entry is marked `failed` (visible
  status) but is **not abandoned**: every `online` transition and every app
  start resets the schedule and retries. `failed` means "needs attention /
  will retry", never "dropped". Verification mismatches count as failures.
- **Engine:** started once from app boot. Drains oldest-first, one entry at a
  time (serial keeps bandwidth, battery, and interleaved-failure handling
  simple on a tablet that captures at human speed). Triggers: boot scan
  completion, `onEnqueued`, `online` event, backoff timer. Skips work while
  offline or credential-less. A small injected `Clock`/timer interface keeps
  the backoff loop and retention timer fake-timer-testable.

### 7. Device identity (`device/identity.ts`, decisions 7 & 8)

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
- `@dr.pogodin/react-native-fs` (also provides the on-device SHA-256 `hash()`)
- `react-native-get-random-values`, `react-native-url-polyfill`, `uuid`
- `react-native-device-info`
- dev: `aws-sdk-client-mock` (typed S3 mocking in Jest), `@types/uuid` if needed

All native modules autolink; no manual Gradle edits expected beyond what
autolinking does. `jest.setup.js` gains mocks for netinfo (ships its own jest
mock), the fs lib (incl. `hash()`), device-info, and get-random-values.

## Files to change

New:
- `apps/doorman/src/storage/{paths,entrySerializer,entryStore,queue,retention,fs}.ts`
- `apps/doorman/src/sync/{network,credentials,s3Client,backoff,checksums,uploader,syncEngine}.ts`
- `apps/doorman/src/device/identity.ts`
- `apps/doorman/__tests__/` — see Tests below
- `plans/c4610e97-epic-s3-storage-offline-queue-sync.md` (this file)

Modified:
- `apps/doorman/package.json`, root `yarn.lock` — deps above
- `apps/doorman/index.js` — polyfill imports
- `apps/doorman/src/App.tsx` — boot hook only
- `apps/doorman/jest.setup.js` — native-module mocks
- `packages/types/src/entry.ts` — `EntryData` flattened per decision 1; doc
  comments updated
- `packages/types/src/config.ts` — add `local_retention_days` (with doc
  comment: days a hash-verified entry's photos/PII stay on device; `0` =
  scrub immediately after verification)
- `packages/types/src/property.ts` — stale key-shape comment corrected
- `README.md` — short "Offline queue & S3 sync" section: layout diagram,
  status lifecycle incl. hash verification and local scrub, the
  never-delete-from-S3 invariant, credentials seam

## Tests to add

All Jest, in `apps/doorman/__tests__/`, running on plain Node with the mocks
above (repo convention — CI has no device):

- `paths.test.ts` — **golden strings**: exact spec keys for a fixed
  property/timestamp/uuid, incl. zero-padded month/day, UTC (not local) date
  derivation, `config.json` and `commands/` constants.
- `entrySerializer.test.ts` — `data.json` v1 has exactly the spec fields at
  the top level plus `schema_version: 1` (flattened shape), round-trips,
  rejects garbage on parse.
- `entryStore.test.ts` — photos moved (not copied), hashes computed and
  stored in the sidecar, temp+rename atomicity, crash-simulation: dir without
  `data.json` is not enqueued; missing sidecar is rebuilt by re-hashing.
- `queue.test.ts` — boot scan rebuilds the queue; `pending()` oldest-first;
  `listAll()` newest-first; status transitions queued→uploaded /
  queued→failed→queued persist across a simulated restart; corrupt
  `data.json` skipped + logged.
- `backoff.test.ts` — schedule values, cap, jitter bounds, reset.
- `checksums.test.ts` — base64 SHA-256 encoding and multipart composite
  checksum against known-answer vectors for the fixed 5 MiB part size.
- `uploader.test.ts` (aws-sdk-client-mock) — upload order with `data.json`
  strictly last; checksums attached to every put; S3 copy stamped `uploaded`;
  photo uploads go through multipart `Upload`; post-upload `HeadObject`
  verification: matching hashes → `uploaded`, mismatched hash or length →
  retryable failure and **no scrub**; **no Delete command is ever issued**;
  mid-entry failure leaves local status retryable.
- `retention.test.ts` — `local_retention_days: 0` scrubs immediately after
  verification (photos gone, tombstone written, no PII fields remain);
  `local_retention_days: N` keeps files until the window elapses (fake
  timers); unverified entries are never scrubbed; scrub never touches the S3
  client.
- `syncEngine.test.ts` (fake timers) — offline: nothing uploads; `online`
  event drains the queue oldest-first; failure → backoff → retry → success;
  5 failures → `failed` but reconnect retries again; no credentials → idle,
  no throw; verification success triggers the scrub path.
- `network.test.ts` — reachability mapping + single debounced online event.

CI (`yarn lint && yarn typecheck && yarn test`) must stay green; the types
package changes are covered by its `tsc --noEmit` gate and `types.test.ts`.

## Human verification

Things only a human with a device and an AWS account can do — not part of the
automated done-when:

- Sideload on a physical Android tablet; capture a synthetic entry (dev
  harness or the capture branch once merged) in **airplane mode**; confirm the
  entry lands in local storage with `upload_status: queued` and its photos
  present.
- Re-enable connectivity; confirm upload starts without app restart and the
  objects appear in S3 under exactly
  `<property>/YYYY/MM/DD/<entry_id>/{id-front.jpg,id-back.jpg,selfie.jpg,data.json}`.
- Confirm that after the upload completes, the entry's photos are **gone from
  the tablet** (default `local_retention_days: 0`) and only the redacted
  tombstone remains; raise the retention value and confirm files persist for
  the window.
- Kill the app mid-upload, relaunch, confirm the entry resumes and completes.
- Verify with real scoped credentials from the provisioning script that
  uploads succeed and the app never attempts a delete (CloudTrail/S3 access
  logs show only Put/Head/Get).
- Spot-check one uploaded object's checksum in the S3 console against the
  device log's recorded hash.

## Out of scope (other epics)

Capture UI/CV/OCR (parallel branch 69897ede), QR pairing and real credential
delivery, Android Keystore persistence (security epic), config.json polling
and commands/ handling (admin + polling tickets — including the admin UI that
surfaces the newest-first entry list and the `local_retention_days` setting),
provisioning script, notifications.
