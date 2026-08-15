# Virtual Doorman

Tablet app for managing IDs of people entering a building. A wall-mounted
Android tablet captures a visitor's ID, reads it, asks the property's questions
and syncs the result to S3; a phone-based master app configures and recovers
paired tablets.

Distribution is **sideloaded APK only** — no app stores, no iOS.

## Layout

Yarn 4 workspaces monorepo (`nodeLinker: node-modules`):

```
apps/
  doorman/           @virtualdoorman/app — the React Native app (Android only)
    android/         Gradle project, universal APK
    src/
      App.tsx        scaffold screen (role-based entry lands with pairing)
      config/env.ts  typed accessor over the build-time .env
      i18n/          i18next setup + en/es catalogues
packages/
  types/             @virtualdoorman/types — shared document types, no runtime code
plans/               approved implementation plans, one per ticket
```

`@virtualdoorman/types` is consumed as TypeScript source: no build step, no
`dist/`. Metro watches the repo root and tsconfig maps the package name, so an
edit in `packages/types` is visible to the app immediately.

## Prerequisites

- **Node** — the version in [`.nvmrc`](.nvmrc) (`nvm use`).
- **Yarn 4** — provided by Corepack, pinned by `packageManager` in
  `package.json`: run `corepack enable` once.
- **JDK 17** and the **Android SDK** (platform + build tools per
  `apps/doorman/android/build.gradle`), with `adb` on your `PATH`.

## Dev loop

```bash
yarn install          # from the repo root
yarn android          # build a debug APK and install it on the connected device
yarn start            # Metro, if you need it standalone
```

Quality gates — the same three CI runs on every PR:

```bash
yarn lint             # ESLint + Prettier --check, repo-wide
yarn typecheck        # tsc --noEmit in every workspace
yarn test             # Jest (apps/doorman)
yarn format           # rewrite files to Prettier style
```

## Environments

`react-native-config` bakes one `.env` file into the APK, chosen by build type:

| Build type | File                            |
| ---------- | ------------------------------- |
| `debug`    | `apps/doorman/.env.development` |
| `release`  | `apps/doorman/.env.production`  |

Both files are committed and hold **non-secret defaults only**. Machine-local
overrides go in `.env.local` (gitignored). No AWS credentials live here — a
tablet receives those through QR pairing and stores them in the Android
Keystore.

Read values through `src/config/env.ts`, never from `react-native-config`
directly: the accessor validates keys at startup so a bad build fails loudly.

## Release APK (sideload)

Every sideloaded update must be signed with **the same keystore** — Android
refuses to install an update signed by a different key. Generate it once, keep
it out of the repo, and back it up in the owner's secret store. Losing it means
every tablet has to be wiped and reinstalled.

```bash
keytool -genkeypair -v \
  -keystore ~/keystores/virtualdoorman-release.keystore \
  -alias virtualdoorman \
  -keyalg RSA -keysize 4096 -validity 10000
```

Put the credentials in `~/.gradle/gradle.properties` (never in the repo):

```properties
VIRTUALDOORMAN_RELEASE_STORE_FILE=/absolute/path/to/virtualdoorman-release.keystore
VIRTUALDOORMAN_RELEASE_STORE_PASSWORD=…
VIRTUALDOORMAN_RELEASE_KEY_ALIAS=virtualdoorman
VIRTUALDOORMAN_RELEASE_KEY_PASSWORD=…
```

They can also be supplied as `ORG_GRADLE_PROJECT_*` environment variables. If
any is missing, `assembleRelease` fails rather than silently producing a
debug-signed APK.

```bash
cd apps/doorman/android
./gradlew assembleRelease
# → apps/doorman/android/app/build/outputs/apk/release/app-release.apk
```

One universal APK is produced (no ABI splits, no app bundle).

## Sideloading onto a tablet

1. On the tablet: **Settings → About → Build number** (tap 7×) to enable
   developer mode, then **Developer options → USB debugging**.
2. Allow installs from unknown sources for whichever app does the transfer.
3. `adb install -r app-release.apk` (`-r` keeps existing app data; it only
   works when the signing keystore is unchanged).

> **Kiosk hardening** — lock task mode, disabling the status bar, PIN-protected
> exit and the rest of the tablet lockdown are covered by the security ticket
> and documented here once implemented.

## Conventions

- **TypeScript strict everywhere.** `tsconfig.base.json` adds
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and friends; every
  workspace extends it.
- **All app-owned copy goes through `t()`** with keys in
  `apps/doorman/src/i18n/locales/{en,es}.json`. Both catalogues must carry the
  same keys — a test enforces it. The device locale picks the language
  (`en` fallback).
- **Admin-editable copy is not i18n.** Screensaver text, thank-you text and
  form labels come from `config.json` and are modelled in
  `@virtualdoorman/types`.
- **Not-yet-implemented integration points** are marked with a `// FUTURE:`
  comment rather than half-built code.

## CI

`.github/workflows/ci.yml` runs lint, typecheck and test on every pull request
and on pushes to `dev`. The Android SDK is deliberately not installed in CI:
APKs are built locally for sideloading.
