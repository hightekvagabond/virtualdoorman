# Plan: Kiosk capture flow (CV + OCR)

Ticket: 69897ede — epic: Kiosk capture flow (CV + OCR)
Branch: `ticket/69897ede-epic-kiosk-capture-flow-cv-ocr` (from `dev`)

## Context

This epic builds the guest-facing capture experience on the wall tablet:
screensaver → guided 3-step camera capture (ID front, ID back, selfie holding
ID) with CV-driven auto-capture → on-device OCR → admin-configured form
fields → thank-you screen. Everything bilingual EN/ES.

The monorepo scaffold (PR #1) is merged: Yarn 4 workspaces, bare RN 0.87
(pinned exact) in `apps/doorman`, TS strict base config, react-i18next with
`en`/`es` catalogues, `react-native-config` env split, and a runtime-free
`@virtualdoorman/types` package that already models `Config` (screensaver
text, thank-you text, `form_fields`, `cv_confidence_threshold`) and `Entry`
(data.json v1).

Boundaries with sibling tickets, so this plan doesn't overreach:

- **Storage/sync ticket** owns persistence and upload: this ticket ends by
  handing a completed entry draft (3 photo file paths + `data.json` fields) to
  a `submitEntry()` seam it will implement. Photos are written to app-private
  storage by the camera; nothing here touches S3.
- **Pairing ticket** owns where `config.json` comes from: this ticket consumes
  config through a `ConfigProvider` context seeded with an in-repo default
  config, with a clearly-commented injection point for the poller.
- **Security ticket** owns kiosk lockdown/PIN; this ticket only guarantees the
  guest path never surfaces an admin UI (screensaver → capture → thank you).

**Done when (automated):** the capture flow state machine, form-field
renderer, OCR result assembly, and both locales are implemented and covered by
Jest; `yarn lint && yarn typecheck && yarn test` pass. Anything requiring a
physical tablet lives under *Human verification* below.

## Decisions from requester answers (2026-08-20)

All eight open questions from the previous planning round were answered and
resolved; the plan below incorporates them. Summary:

1. **Camera selection** — the paired admin app chooses the default camera
   when the device has more than one; once chosen, that camera is used for
   every capture step until the admin changes it. This ticket therefore adds a
   camera-selection field to `Config` (see §7) and uses that one configured
   camera for all three steps; the admin-side picker UI belongs to the
   pairing/admin epic. Until the admin has chosen, the default is the
   front-facing camera (the only one a guest can face on a wall mount).
2. **Flow orchestration** — pure state machine, no `react-navigation`.
3. **CV detection** — out-of-the-box ML Kit frame-processor plugins
   (text-density scoring for ID sides, face detection for the selfie). Per the
   answer, ML Kit extracting the ID text is a bonus — and it does: the same ML
   Kit text-recognition stack is also the OCR engine (see next item).
4. **OCR engine** — **Google ML Kit text recognition**, not Tesseract. The
   parent spec's "react-native-tesseract-ocr or equivalent" is satisfied by ML
   Kit as the explicitly requester-approved equivalent: fully on-device, and
   maintained. The engine name/version is recorded inside `ocr_raw`.
5. **Languages** — EN + ES both fully supported (first deployment is in a
   Spanish-speaking country). ML Kit's Latin-script recognizer covers English
   and Spanish out of the box with no downloadable language packs, so no
   traineddata assets are bundled at all.
6. **Idle timeout** — 90 seconds, and configurable: it ships as
   `idle_timeout_seconds` in `Config` (default 90 in the in-repo default
   config) so admins can change it via config.json once the pairing epic wires
   remote config.
7. **Manual capture fallback** — yes: a manual shutter button appears after
   10 s on a capture step, recording the live confidence score at press time.
8. **`cv_confidence_threshold` default** — 0.7 in the in-repo default config.

## Approach

### 1. Flow orchestration — a pure state machine, no navigation library

The kiosk flow is strictly linear with a single loop-back point (retry a
capture step) and a global "idle → screensaver" reset. That is a reducer, not
a navigation graph, so no `react-navigation` dependency is added (confirmed by
the requester):

- `src/capture/flowReducer.ts` — pure `(state, event) => state` over states
  `screensaver → id-front → id-back → selfie → form → submitting → thank-you`,
  plus per-step `error` sub-states (camera unavailable, OCR failed, submit
  failed) each offering retry. Pure and unit-testable on Node.
- `src/capture/CaptureFlow.tsx` — `useReducer` around the reducer, renders the
  screen for the current state, owns the in-memory `EntryDraft` (photo paths,
  per-side OCR results, cv confidences, form answers).
- Idle watchdog: any state except `screensaver` arms an inactivity timer of
  `config.idle_timeout_seconds` (default 90 — see §7); firing discards the
  draft and returns to the screensaver.
- `App.tsx`: the existing `// FUTURE: role-based entry` branch point renders
  `<CaptureFlow />` wrapped in `<ConfigProvider>`; the pairing ticket later
  gates this behind paired-client state.

### 2. Screens

All screens use large touch targets (min 56 dp), the existing i18n convention
(`t()` for app chrome, `config.json` values verbatim for admin copy), and a
shared `ProgressIndicator` (step x of 4) during the flow.

- **`ScreensaverScreen`** — full-screen idle display showing
  `config.screensaver_text` (admin copy, rendered verbatim) plus an i18n'd
  "touch to begin" affordance in both languages simultaneously (EN + ES on
  screen at once — a public kiosk can't know the guest's language). Any touch
  dispatches `WAKE`. A `// FUTURE:` comment marks where the pairing ticket's
  wake-triggered config poll hooks in.
- **`CaptureStepScreen`** — one parameterized screen for all three camera
  steps (`id-front` | `id-back` | `selfie`): live `react-native-vision-camera`
  preview on the admin-configured camera (§7), `CameraGuidanceOverlay`
  (mask/frame guide + bilingual text prompt per step), live confidence
  feedback, auto-capture when the frame-processor confidence meets
  `config.cv_confidence_threshold` stably (see §3), and a manual shutter
  button that appears after 10 s as a fallback (recording the live confidence
  score at press time). Camera permission denied / no camera → `ErrorState`
  with retry.
- **`FormFieldsScreen`** — renders `config.form_fields` sorted by `order`,
  one `FormField` per `FormFieldConfig` mapping `type` to keyboard/input
  (`text`/`email`/`phone`/`number`/`date`), labels shown verbatim (admin
  copy), `required` validation with an i18n'd error message. Renders nothing
  but the continue button when the admin configured zero fields.
- **`ThankYouScreen`** — shows `config.thank_you_text` (types default:
  "Thank you, please proceed"); on entry it fires the Home Assistant stub
  (§6) and auto-returns to the screensaver after a few seconds.

### 3. CV auto-capture — vision-camera + ML Kit frame processors

- Add `react-native-vision-camera` + `react-native-worklets-core` (frame
  processor runtime), pinned exact like other native deps.
- **Camera device selection:** `src/capture/cameraDevice.ts` resolves
  `config.camera_id` (§7) against `Camera.getAvailableCameraDevices()`; when
  `null` (admin hasn't chosen) or the id no longer exists, it falls back to
  the default front-facing device. The same resolved device is used for all
  three capture steps — camera choice is a device-level admin setting, not a
  per-step one.
- `src/capture/cv/frameProcessor.ts` + `useAutoCapture.ts`: a frame processor
  produces a per-frame detection score in `[0..1]`; the hook smooths it
  (rolling window) and requires N consecutive frames ≥
  `config.cv_confidence_threshold` before triggering `takePhoto()` — this
  stability window is what prevents capturing mid-motion blur.
- Detection per step, using out-of-the-box on-device ML Kit frame-processor
  plugins (no custom model training in this epic — confirmed):
  - **ID front/back:** text-recognition plugin on downscaled frames; score =
    normalized text-block area/count inside the overlay guide region (an ID
    held steady in frame is text-dense; an empty wall is not).
  - **Selfie holding ID:** face-detection plugin; score = face present ×
    face size/position sanity. (Verifying the ID is *also* in frame is left
    as a `// FUTURE:` training hook — see §5.)
- The recorded `Entry.cv_confidence` is the smoothed score at the moment of
  capture (manual captures record the live score too).
- The scoring functions are pure TS (worklet-callable), unit-tested with
  synthetic detection inputs; the camera/native layer is mocked in Jest.

### 4. OCR — Google ML Kit text recognition on the captured stills

Requester decision: use Google ML Kit (fully on-device) instead of the
unmaintained `react-native-tesseract-ocr`. This also unifies the stack — the
same ML Kit text-recognition capability drives both the live CV score (§3)
and the post-capture OCR extraction.

- OCR runs on the full-resolution captured photo *after* capture (highest
  quality input, no per-frame cost), asynchronously while the guest proceeds
  to the next step; results are awaited before submit.
- Library: an ML Kit text-recognition binding for stills (e.g.
  `@react-native-ml-kit/text-recognition`), plus the vision-camera ML Kit
  plugins for the live frame scores in §3. Exact packages are pinned at build
  time to whatever compiles cleanly against RN 0.87/new architecture; the
  `runOcr` seam below keeps the choice swappable.
- **Languages:** ML Kit's default Latin-script recognizer covers English and
  Spanish together with no language packs or traineddata assets — both
  languages are first-class per the requester (first deployment is in a
  Spanish-speaking country). No APK asset cost.
- `src/capture/ocr/ocr.ts` — `runOcr(photoPath): Promise<OcrSideResult>`
  wraps the native call and assembles **everything** the engine returns into
  the raw structure: full text, blocks/lines/elements with bounding boxes,
  language hints and confidences where the binding exposes them, engine name +
  version, timing. Per the spec: more is better, no filtering, no parsing
  into semantic fields.
- **Types change** (`packages/types/src/entry.ts`): the scaffold typed
  `ocr_raw` as `string | null`; this ticket's spec says ocr_raw is JSON. Widen
  to a structured `OcrRaw` (`{ engine: string, front: OcrSideResult | null,
  back: OcrSideResult | null }`, exported from the barrel) — the engine name
  is recorded per the requester's answer. `EntryData` remains
  `schema_version: 1` — nothing has shipped, v1 is still being defined.

### 5. ID type recognition — stub only

- `src/capture/ocr/idType.ts` — `recognizeIdType(ocr: OcrRaw): IdType`
  returning `'unknown'` unconditionally, with prominent `// TRAINING HOOK:`
  comments describing the intended future pipeline (classify from OCR layout +
  frame features; where labeled captures would be collected; where a model
  would slot into the frame processor).
- **Types change**: add `IdType` (`'unknown'` today, commented union for
  future values) and `Entry.id_type` to `packages/types`.

### 6. Integration seams (stubs, clearly commented)

- `src/integrations/homeAssistant.ts` — `notifyHomeAssistant(entry)`: no-op
  returning immediately, header comment stating it is NOT implemented, what it
  will eventually do (door release on completed check-in), and that config for
  it will arrive via `config.json`. Called from `ThankYouScreen` so the call
  site already exists.
- `src/capture/submitEntry.ts` — assembles the final `EntryData` (uuid v4
  `entry_id`, `timestamp_utc`, `device_id` placeholder until pairing,
  `app_version` from native, `upload_status: 'queued'`, `booking_system:
  null`) and hands it to a clearly-commented seam the storage ticket
  implements (for now: logs and resolves, with a `// FUTURE(storage-ticket):`
  marker). Failure path drives the flow's submit-error state.

### 7. Config provider and Config type additions

- **Types change** (`packages/types/src/config.ts`), following the existing
  doc-comment style:
  - `camera_id: string | null` — the camera device the admin selected in the
    paired admin app (vision-camera device id). `null` until the admin has
    chosen; the tablet then uses its default front-facing camera. Once set,
    this camera is used for every capture step until the admin changes it
    (requester decision). The picker UI itself ships with the pairing/admin
    epic — this ticket only consumes the field.
  - `idle_timeout_seconds: number` — how long a mid-flow guest can be
    inactive before the draft is discarded and the screensaver returns.
    Default 90 (requester decision: "90 seconds and configurable").
- `src/config/defaultConfig.ts` — a complete `Config` literal used until the
  pairing ticket wires the S3 poller: sensible screensaver/thank-you defaults
  (thank-you: "Thank you, please proceed"), one example form field
  (`guest_of_room_number` / "Guest of room number"), `cv_confidence_threshold:
  0.7` (requester-confirmed default), `camera_id: null`,
  `idle_timeout_seconds: 90`, `poll_interval_minutes: 20`, notifications off.
- `src/config/ConfigProvider.tsx` — React context exposing `Config`; a
  `// FUTURE(pairing-ticket):` comment marks the swap-in point for remote
  config. Screens read config only through `useConfig()`.

### 8. i18n

New keys in `en.json`/`es.json` for every app-owned string: wake prompt,
per-step camera guidance, hold-still/auto-capture feedback, manual shutter,
progress labels, form validation errors, error states (camera unavailable /
OCR failed / submit failed) + retry, thank-you fallback chrome. Admin copy
(`screensaver_text`, `thank_you_text`, field labels) stays out of the
catalogues per the established convention. Add a key-parity test (see Tests).

### 9. Android / native changes

- `AndroidManifest.xml`: add `android.permission.CAMERA`; add
  `<uses-feature android:name="android.hardware.camera" android:required="false"/>`
  so sideloading isn't blocked on odd hardware (runtime handles absence).
- `MainActivity`: `FLAG_KEEP_SCREEN_ON` (a wall kiosk must never sleep to
  Android's lockscreen; the app's screensaver state is the "sleep").
- Gradle: whatever the pinned vision-camera/ML Kit versions require (worklets
  plugin in `babel.config.js`; ML Kit models come bundled via the Android
  dependencies — no asset files to add).
- Jest: mock `react-native-vision-camera`, the frame-processor plugins, and
  the ML Kit text-recognition module in `jest.setup.js`, following the
  existing mock style.

## Files to change

```
packages/types/src/
  entry.ts                 # ocr_raw: OcrRaw | null; add id_type; OcrRaw/OcrSideResult/IdType
  config.ts                # add camera_id, idle_timeout_seconds
  index.ts                 # export new types
apps/doorman/
  package.json             # + react-native-vision-camera, react-native-worklets-core,
                           #   ML Kit frame-processor plugins, ML Kit text-recognition, uuid
  babel.config.js          # + worklets plugin
  jest.setup.js            # + mocks for camera/ML Kit native modules
  android/app/src/main/AndroidManifest.xml   # CAMERA permission, uses-feature
  android/app/src/main/java/com/virtualdoorman/MainActivity.kt  # keep-screen-on
  src/App.tsx              # render ConfigProvider + CaptureFlow at the FUTURE branch point
  src/i18n/locales/en.json # new keys
  src/i18n/locales/es.json # new keys
  src/config/defaultConfig.ts        (new)
  src/config/ConfigProvider.tsx      (new)
  src/capture/flowReducer.ts         (new)
  src/capture/CaptureFlow.tsx        (new)
  src/capture/cameraDevice.ts        (new)
  src/capture/submitEntry.ts         (new)
  src/capture/screens/ScreensaverScreen.tsx  (new)
  src/capture/screens/CaptureStepScreen.tsx  (new)
  src/capture/screens/FormFieldsScreen.tsx   (new)
  src/capture/screens/ThankYouScreen.tsx     (new)
  src/capture/components/CameraGuidanceOverlay.tsx  (new)
  src/capture/components/ProgressIndicator.tsx      (new)
  src/capture/components/FormField.tsx               (new)
  src/capture/components/ErrorState.tsx              (new)
  src/capture/cv/frameProcessor.ts   (new)
  src/capture/cv/useAutoCapture.ts   (new)
  src/capture/ocr/ocr.ts             (new)
  src/capture/ocr/idType.ts          (new)
  src/integrations/homeAssistant.ts  (new)
```

## Tests to add (Jest, existing preset/mocks style)

- `flowReducer.test.ts` — full happy path screensaver→thank-you; retry loops
  from each error state; idle-timeout reset discards the draft from every
  mid-flow state; draft accumulates photo paths/confidences correctly.
- `useAutoCapture.test.ts` / cv scoring — smoothing window math; fires only
  after N consecutive frames ≥ threshold; threshold read from config; manual
  fallback appears after the 10 s delay and records the live score.
- `cameraDevice.test.ts` — `camera_id` resolves to the matching device;
  `null` or a stale id falls back to the default front-facing device.
- `ocr.test.ts` — mocked engine output is assembled into `OcrSideResult`
  losslessly (nothing dropped/filtered); engine name recorded in `ocr_raw`;
  engine failure yields the OCR error state, not a crash; null-side handling.
- `idType.test.ts` — always `'unknown'`; shape matches `Entry.id_type`.
- `submitEntry.test.ts` — assembled `EntryData` matches the v1 wire shape
  (snake_case keys, `upload_status: 'queued'`, `booking_system: null`).
- `FormFieldsScreen.test.tsx` — renders fields from a config fixture sorted by
  `order`; required validation blocks continue; each `FormFieldType` maps to
  the right input props; zero-field config renders continue only.
- Screen render tests for Screensaver (shows config text verbatim, touch
  dispatches wake) and ThankYou (config text, HA stub called once).
- `i18n-parity.test.ts` — `en.json` and `es.json` have identical key sets
  (guards the "fully bilingual" requirement structurally).

## Human verification

These cannot be checked by the automated build/review loop and are explicitly
excluded from the done-when criteria:

- Run the flow end-to-end on the physical Android wall tablet: wake from
  screensaver, all three captures auto-fire at sensible moments with a real ID.
- Judge ML Kit OCR quality on a real driver's license / passport card
  (front + back), including a Spanish-language ID, and confirm `ocr_raw` in
  the produced data.json is populated and unfiltered.
- Confirm camera preview orientation/mirroring is correct on the actual
  mounted tablet (portrait vs landscape mount), and that setting `camera_id`
  in config actually switches the active camera on multi-camera hardware.
- Switch the tablet's system locale to Spanish and walk the flow visually.
