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

## Decisions (resolved with the requester)

All nine open questions from the previous round were answered; every
recommendation was accepted. The plan below treats these as fixed:

1. **App topology:** one RN app, `apps/doorman`, with role-based entry
   (client/master mode chosen at pairing/setup). The `apps/*` layout keeps a
   later split cheap.
2. **RN flavor:** bare React Native via the community CLI (no Expo) — kiosk
   mode, vision-camera frame processors, and Tesseract need unrestricted
   native access; we ship a plain sideloaded APK.
3. **Package manager:** modern Yarn 4 (berry) with `nodeLinker: node-modules`.
4. **RN version:** pin the latest stable exactly at implementation time; hold
   it for the epic, upgrade deliberately.
5. **`minSdkVersion`:** RN template default (API 24 / Android 7).
6. **Naming:** Android `applicationId` = `com.virtualdoorman`; workspace
   packages under the `@virtualdoorman/*` scope.
7. **Release signing:** generate one dedicated keystore now, stored outside
   the repo (developer machine / secret store), documented in README —
   sideload updates require consistent signing.
8. **CI:** GitHub Actions workflow for lint + typecheck + test now; APK-build
   CI deferred.
9. **Env split:** `react-native-config` `.env` files mapped to build types.

## Approach

Yarn-workspaces monorepo (Yarn 4, `nodeLinker: node-modules`) with an
`apps/` + `packages/` split:

```
/
├── package.json                  # workspace root: workspaces, packageManager pin, shared scripts
├── .yarnrc.yml                   # nodeLinker: node-modules
├── .nvmrc                        # Node LTS pin
├── .gitignore                    # node_modules, .yarn cache dirs, android build output, .env.local, keystores
├── .github/
│   └── workflows/
│       └── ci.yml                # lint + typecheck + test on PR/push
├── tsconfig.base.json            # strict-mode base config, path aliases
├── .eslintrc.js                  # extends @react-native/eslint-config + prettier
├── .prettierrc.js
├── README.md                     # rewritten: overview, APK build + sideload instructions
├── plans/                        # this file
├── apps/
│   └── doorman/                  # the single React Native app (bare RN CLI, TypeScript)
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

### 1. Workspace root (Yarn 4)

- `package.json`: `private: true`, `workspaces: ["apps/*", "packages/*"]`,
  `"packageManager": "yarn@4.x.y"` (exact version pinned at implementation
  time; activated via corepack).
- `.yarnrc.yml`: `nodeLinker: node-modules` — RN/Metro/Gradle tooling assumes
  a real `node_modules` tree; no PnP, no zero-installs (Yarn cache dirs and
  install state gitignored, only `.yarn/releases` committed if we vendor the
  release — default is corepack, nothing vendored).
- Root convenience scripts so the acceptance command works from the repo root:
  - `"android": "yarn workspace @virtualdoorman/app android"`
  - `"start"`, `"lint"`, `"typecheck"`, `"test"` fan out to workspaces.
- `.nvmrc` pinning current Node LTS; `engines` field enforcing node + yarn.

### 2. React Native app (`apps/doorman`)

- Scaffold from the official React Native community CLI TypeScript template
  (the template is TS by default) at the **latest stable RN version, pinned
  exactly** in `package.json` (no `^`/`~`) and held for the epic; then move
  into `apps/doorman` and strip iOS (`ios/` directory removed — Android-only,
  sideload target; keeps the repo and CI surface small).
- Single app for both roles: this ticket only scaffolds a placeholder
  `App.tsx`; the role-based entry (client kiosk vs. master admin, chosen at
  pairing/setup) lands in the pairing ticket. A `// FUTURE:` comment in
  `App.tsx` marks the branch point.
- `android/app/build.gradle`: `applicationId "com.virtualdoorman"` (Java
  package renamed from the template to match); `minSdkVersion` left at the RN
  template default (API 24 / Android 7).
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
  - Keystore: one dedicated release keystore generated during implementation,
    stored **outside the repo** on the owner's machine (with a backup in their
    secret store); README documents generation (`keytool` one-liner), the
    gradle property names, and why the same keystore must sign every sideload
    update.
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

### 8. CI (GitHub Actions)

`.github/workflows/ci.yml`, triggered on pull requests and pushes to `dev`:

- Single Ubuntu job: checkout → setup Node from `.nvmrc` with corepack/Yarn 4
  cache → `yarn install --immutable` → `yarn lint` → `yarn typecheck` →
  `yarn test`.
- No Android SDK / APK build in CI (deferred per the requester's answer) —
  keeps the workflow fast and dependency-free.

## Files to change

All new files (repo currently contains only `README.md`, which is rewritten):

- `package.json`, `.yarnrc.yml`, `.nvmrc`, `.gitignore`, `tsconfig.base.json`,
  `.eslintrc.js`, `.prettierrc.js`, `README.md`
- `.github/workflows/ci.yml`
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

CI runs `yarn lint`, `yarn typecheck`, and `yarn test` on every PR (section 8).

Manual verification (documented in the PR):
- `yarn android` against an emulator/device installs and launches the app.
- `./gradlew assembleRelease` emits an installable APK.
- Device language set to Spanish renders the ES strings; anything else → EN.

## Out of scope (later tickets)

Capture flow, camera/OCR deps, S3 client, offline queue, pairing/QR, kiosk
mode, admin PIN, master phone screens, role-based entry implementation. This
ticket only guarantees the skeleton they plug into.

All previously open questions were answered by the requester and are recorded
in the **Decisions** section above — none remain.
