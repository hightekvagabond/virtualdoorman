# Plan: Monorepo & build infrastructure

Ticket: 9e3ecde8 — epic: Monorepo & build infrastructure
Branch: `ticket/9e3ecde8-epic-monorepo-build-infrastructure` (from `dev`)

## Context

The repository is currently empty except for the initial README, so this ticket
establishes the conventions every later ticket (capture flow, S3 sync, pairing,
master admin app, kiosk hardening) builds on. Target: a TypeScript React Native
monorepo producing a sideloaded Android APK — no app stores, no iOS.

**Done when:** `yarn android` produces a working APK, i18n renders both locales
(EN/ES), and shared types are importable across the codebase.

## Approach

Yarn-workspaces monorepo (the spec's `yarn android` acceptance criterion fixes
yarn as the package manager) with an `apps/` + `packages/` split:

```
/
├── package.json                  # workspace root: workspaces, shared scripts
├── .nvmrc                        # Node LTS pin
├── .gitignore                    # node_modules, android build output, .env files, keystores
├── tsconfig.base.json            # strict-mode base config, path aliases
├── .eslintrc.js                  # extends @react-native/eslint-config + prettier
├── .prettierrc.js
├── README.md                     # rewritten: overview, APK build + sideload instructions
├── plans/                        # this file
├── apps/
│   └── doorman/                  # the React Native app (bare RN CLI, TypeScript)
│       ├── package.json          # name: @virtualdoorman/app
│       ├── android/              # Gradle project from the RN template, APK-tuned
│       ├── metro.config.js       # monorepo-aware (watchFolders → repo root)
│       ├── babel.config.js
│       ├── tsconfig.json         # extends ../../tsconfig.base.json
│       ├── index.js
│       └── src/
│           ├── App.tsx           # minimal screen proving i18n + shared-types imports
│           ├── i18n/
│           │   ├── index.ts      # react-i18next init, device-locale detection, en fallback
│           │   └── locales/
│           │       ├── en.json
│           │       └── es.json
│           └── config/
│               └── env.ts        # typed accessor over the dev/prod environment split
└── packages/
    └── types/                    # name: @virtualdoorman/types
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts          # barrel export
            ├── entry.ts          # Entry + data.json v1 shape
            ├── config.ts         # Config (config.json shape)
            ├── command.ts        # Command (recovery commands)
            └── property.ts       # Property
```

### 1. Workspace root

- `package.json`: `private: true`, `workspaces: ["apps/*", "packages/*"]`.
- Root convenience scripts so the acceptance command works from the repo root:
  - `"android": "yarn workspace @virtualdoorman/app android"`
  - `"start"`, `"lint"`, `"typecheck"`, `"test"` fan out to workspaces.
- `.nvmrc` pinning current Node LTS; `engines` field enforcing node + yarn.

### 2. React Native app (`apps/doorman`)

- Scaffold from the official React Native community CLI TypeScript template
  (the template is TS by default), then move into `apps/doorman` and strip iOS
  (`ios/` directory removed — Android-only, sideload target; keeps the repo and
  CI surface small).
- **Metro**: `watchFolders: [repoRoot]`, `resolver.nodeModulesPaths` covering
  both the app's and the root `node_modules`, so hoisted workspace deps and
  `@virtualdoorman/types` resolve. Types package is consumed as TS source via
  tsconfig path alias + Metro resolution — no build step for the types package.
- **Gradle / APK**:
  - Keep template defaults: Hermes on, New Architecture per template default.
  - `debug` build type: standard debug keystore (works out of the box for
    `yarn android` against a connected tablet).
  - `release` build type: signing config read from `~/.gradle/gradle.properties`
    / env vars (keystore never committed); `./gradlew assembleRelease` produces
    the sideloadable APK. No AAB/bundle config — APK only.
  - `abiFilters`/splits left at universal APK (single file to sideload).

### 3. TypeScript strict mode, ESLint, Prettier

- `tsconfig.base.json`: `strict: true` plus `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `exactOptionalPropertyTypes`, `isolatedModules`,
  `paths: { "@virtualdoorman/types": ["packages/types/src"] }`.
- ESLint: `@react-native/eslint-config` + `eslint-config-prettier` at the root
  so both workspaces share one config; `yarn lint` runs repo-wide.
- Prettier config at root (template defaults: single quotes, trailing commas).

### 4. i18n scaffold

- `react-i18next` + `i18next`, `react-native-localize` for device-locale
  detection.
- `src/i18n/index.ts`: initializes i18next with `en` + `es` resources,
  language chosen from `RNLocalize.findBestLanguageTag(['en','es'])`,
  `fallbackLng: 'en'`.
- Seed locale files with the strings the scaffold App actually renders
  (app title, a welcome line) — real screens add keys in later tickets.
- Convention documented in README: **all** user-facing copy goes through
  `t()`; admin-configurable strings (screensaver text, thank-you text, form
  labels) are *not* i18n keys — they come from `config.json` (per the
  cross-cutting ticket) and the types package models that.

### 5. Shared types package (`packages/types`)

Pure `.d.ts`-style interface package (no runtime code, no build step),
modeled directly from the sibling tickets' specs:

- `Entry` / `EntryData` — data.json v1: `entry_id`, `property`,
  `timestamp_utc`, `device_id`, `ocr_raw`, `form_fields`, `cv_confidence`,
  `upload_status: 'queued' | 'uploaded' | 'failed'`, `app_version`,
  `booking_system: null` (stub, commented as future integration).
- `Config` — config.json: screensaver text, thank-you text, admin-configured
  form field definitions (`FormFieldConfig[]`: id, label, type, order),
  `poll_interval_minutes` (default 20), notifications block (off by default),
  CV confidence threshold, `booking_system` stub field.
- `Command` — discriminated union over `type: 'unpair' | 'reset' |
  'update-pin' | 'repair'` with per-command payloads (`update-pin` carries the
  new PIN) plus ack metadata.
- `Property` — property name, bucket, prefix helpers' input shape.

Each stub field carries a `// FUTURE:` comment per the cross-cutting ticket's
"clearly commented, not implemented" rule.

### 6. Environment config (dev / prod)

- `react-native-config` with `.env.development` / `.env.production` files
  (committed with non-secret defaults; `.env.local` gitignored for secrets).
- Gradle wired so `envConfigFiles` maps debug→development, release→production.
- `src/config/env.ts` exposes a typed, validated `Env` object (fails fast on
  missing keys) so the rest of the codebase never touches `Config` from the
  library directly. Initial keys: `ENV_NAME`, `LOG_LEVEL`; later tickets add
  their own (no AWS secrets in env files — those arrive via QR pairing and go
  to the Keystore per the security ticket).

### 7. README

Rewrite `README.md`:
- Project overview + monorepo layout.
- Prereqs (Node via `.nvmrc`, yarn, JDK 17, Android SDK/adb).
- Dev loop: `yarn install`, `yarn android`, `yarn start`.
- Release APK build: keystore generation (`keytool` one-liner), signing
  props, `./gradlew assembleRelease`, output path.
- Sideload instructions: enable developer mode / unknown sources on the
  tablet, `adb install -r app-release.apk`, plus a placeholder section for the
  security ticket's hardening notes.

## Files to change

All new files (repo currently contains only `README.md`, which is rewritten):

- `package.json`, `.nvmrc`, `.gitignore`, `tsconfig.base.json`,
  `.eslintrc.js`, `.prettierrc.js`, `README.md`
- `apps/doorman/**` — RN TypeScript app as laid out above (template output
  minus `ios/`, plus `src/i18n/**`, `src/config/env.ts`, monorepo-aware
  `metro.config.js`, env-wired `android/app/build.gradle`)
- `packages/types/**` — package.json, tsconfig.json, `src/{index,entry,config,command,property}.ts`
- `.env.development`, `.env.production` (in `apps/doorman/`)

## Tests to add

Jest (from the RN template, jest-preset react-native) in `apps/doorman`:

- `__tests__/App.test.tsx` — smoke render of `App` via react-test-renderer;
  asserts a translated string is present (proves i18n init + render path).
- `__tests__/i18n.test.ts` —
  - `en.json` and `es.json` have identical key sets (locale-parity guard, so
    a missing Spanish translation fails CI-style checks from day one);
  - switching `i18n.changeLanguage('es')` returns the Spanish string, unknown
    locale falls back to English.
- `__tests__/types.test.ts` — imports `Entry`, `Config`, `Command`, `Property`
  from `@virtualdoorman/types` and constructs valid sample objects (proves
  cross-workspace importability; `yarn typecheck` catches shape drift).
- `packages/types`: `yarn typecheck` (tsc --noEmit) is the test — no runtime
  code to unit test.

Manual verification (documented in the PR):
- `yarn android` against an emulator/device installs and launches the app.
- `./gradlew assembleRelease` emits an installable APK.
- Device language set to Spanish renders the ES strings; anything else → EN.

## Out of scope (later tickets)

Capture flow, camera/OCR deps, S3 client, offline queue, pairing/QR, kiosk
mode, admin PIN, master phone screens. This ticket only guarantees the skeleton
they plug into.

## Open questions

- App topology: the tablet (guest capture) and the owner's phone (admin) are described in separate tickets — should this scaffold create one RN app that serves both roles (mode chosen at pairing/setup), or two apps (`apps/doorman-client`, `apps/doorman-master`) in the monorepo now? I recommend a single app (`apps/doorman`) with role-based entry, since "single codebase" and one APK to sideload keeps ops simplest; the `apps/*` layout leaves a later split cheap.
- React Native flavor: bare React Native via the community CLI, or Expo (prebuild)? I recommend bare RN CLI — kiosk mode, vision-camera frame processors, and Tesseract need unrestricted native access and we ship a plain sideloaded APK.
- Yarn version: classic v1 or modern Yarn (berry) with `nodeLinker: node-modules`? I recommend modern Yarn 4 with node-modules linker — current RN tooling assumes a node_modules tree, and Yarn 4 gives reliable workspace hoisting control.
- React Native version pinning: pin the latest stable at implementation time and hold it for the epic, or track minors? I recommend pinning latest stable (exact version in package.json) and upgrading deliberately.
- Android version floor for the wall tablets: which `minSdkVersion`? I recommend the RN template default (currently API 24 / Android 7) unless the target tablets are known to be older.
- Application ID / package naming: `com.virtualdoorman` for the Android applicationId and `@virtualdoorman/*` for workspace packages? I recommend exactly that.
- Release signing: who owns the release keystore, and where does it live (developer machine, shared secret store)? I recommend generating one dedicated keystore now, storing it outside the repo (documented in README), since sideload updates require consistent signing.
- CI: is a GitHub Actions workflow (lint + typecheck + test, optionally debug-APK build) in scope for this ticket? I recommend adding the cheap lint/typecheck/test workflow now and deferring APK-build CI.
- Environment split mechanism: `react-native-config` .env files mapped to build types, or a pure-TS env module switched on `__DEV__`/build type? I recommend react-native-config — later tickets (bucket defaults, log levels) get real per-env values without code changes.
