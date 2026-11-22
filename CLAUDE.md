# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AuthLeu is an open-source TOTP 2FA authenticator (an Authy / Google Authenticator alternative). It's an Ionic 8 + Angular 18 app that ships only as a PWA; there's no native build, and Capacitor was removed in 3.0. It can sync accounts through Firebase (Auth + Firestore) or run fully offline using local storage.

## Commands

```bash
npm start                    # ng serve (development config, environment.ts)
npm run build                # production build -> www/ (environment.prod.ts, Firebase-backed)
npm run build:githubpages    # GitHub Pages build (environment.githubpages.ts, offline env, relative base href)
npm run lint                 # angular-eslint over src/**/*.ts and src/**/*.html
npm test                     # Karma + Jasmine in Chrome, watch mode
npm run test:ci              # single headless run, as in CI
npx ng test --watch=false --browsers=ChromeHeadless --include src/app/path/to/file.spec.ts   # run a single spec file
npm run translations:check   # verify every key in en.json exists in all other i18n files
```

Test coverage is thin. Specs sit next to their sources (`*.spec.ts`), and most cover models and services. `OtpService` is checked against the RFC 6238 test vectors.

## CI

- **Every pull request** (and every push to `main`) runs the `CI` workflow (`.github/workflows/ci.yml`): `npm ci`, lint, `npm run test:ci`, and both production builds.
- **PRs to `main` must also bump the `package.json` version;** the version-check workflow fails otherwise.
- **PRs to `main` must also pass `npm run translations:check`.** Any key added to `src/assets/i18n/en.json` must also be added to `pt.json` (and to any other locale file).
- Pushing to `main` deploys to both GitHub Pages and Firebase Hosting (project `authleu`). PRs from the same repo get a Firebase preview channel.

## Build-time version injection (gotcha)

`npm run build` and `npm run build:githubpages` both run a pre-step (`resources/scripts/version-config.js`) through their `prebuild` / `prebuild:githubpages` scripts. If you add a build script, give it a matching `pre…` script: npm only runs `prebuild` before a script named exactly `build`. The script **rewrites `src/environments/environment*.ts` in place**, replacing `%VERSION%`, `%BUILD_DATE%` and `%COMMIT_HASH%` (the hash comes from `LAST_COMMIT_SHA`). Don't commit those substitutions; the placeholders must stay in source.

`ng serve` doesn't run this step, so in development `versionNumber` is the literal `"%VERSION%"` and no data migrations run. To test migrations locally, temporarily set `versionNumber` in `environment.ts`.

## Architecture

The app is NgModule-based (not standalone). Import Ionic from `@ionic/angular`; `.vscode/settings.json` excludes the `/standalone` entry point from auto-import. There are two lazy routes:
- `login`: email/password Firebase login or "continue offline".
- `home`: guarded by `AuthenticationService.canActivate()`, which always passes in offline mode. `HomePageModule` declares all the UI components under `home/components/`.

### Account storage: one facade over local and remote providers

`services/accounts/account2fa.service.ts` (`Account2faService`) is the only thing the UI should talk to. At construction it picks a provider that implements `IAccount2FAProvider` (in `models/account2FA.model.ts`):
- **`LocalAccount2faService`**: keeps accounts in Ionic Storage under the `local_accounts` key and exposes them through a `BehaviorSubject`.
- **`RemoteAccount2faService`**: Firestore at `accounts2fa/{uid}/accounts`. The query is `active == true` ordered by `added`, which needs the composite index in `firestore.indexes.json`; access rules are in `firestore.rules`. Remote snapshots are **mirrored into the local service** (`updateAccountsBatch(accounts, replaceExisting=true)`), and the UI observes the local subject. That's how cached and offline reads keep working. Writes go directly to Firestore. When the listener fails, the error is published on `syncError$` (exposed by the facade; `HomePage` shows a toast) and the listener retries with a growing delay. Being offline doesn't count as a failure, because Firestore serves its cache.

The provider is chosen by `AppConfigService.isOfflineMode()`, which reads the `isOfflineMode` storage pref. `environment.isOfflineEnv` controls whether the login screen offers online login at all; the GitHub Pages build is offline-only.

### Secret encryption

- `Account2FA` holds either a plaintext `secret` or the `encryptedSecret` + `iv` + `salt` triple. Encryption is AES-GCM with a PBKDF2-derived key (`utils/crypto-utils.ts`).
- `isLocked` means there's no valid base32 secret in memory. `lock()` and `unlock()` change the instance in place. `unlock()` deletes the encrypted fields, so a decrypted account looks the same as one that was never encrypted.
- `Account2faService.getAccounts()` decrypts accounts in memory using the stored password (storage key `_eok`).
- **Saving goes through `Account2faService.toStoredAccount()`.** `addAccount`, `importAccounts`, `updateAccount` and `updateAccountsBatch` save a copy, never the caller's object. While encryption is active (`encryptionActive` plus a stored key), that copy is always encrypted. A plaintext secret is never saved next to its ciphertext.
- Don't save through the providers directly. The one exception is `decryptAccounts()`, which saves plaintext on purpose while turning encryption off. It runs while encryption is still flagged active, so going through the facade would re-encrypt the secrets.
- Use `account.copy()` before changing accounts that came from the observable.
- `home/password.service.ts` handles password setup, the unlock prompt, and the weekly password check.

### Data migrations

`MigrationService.migrate()` runs at the start of `HomePage.ngOnInit` and shows progress text on the splash screen. To add a migration:
1. Add the version to the `AppVersion` enum (`models/app-version.enum.ts`).
2. Add a `case` in `runMigration`, along with a `migrateToVx_y_z()` method.

Migrations run for enum versions where `stored data_version < version <= app version`. `VersionUtils.pendingMigrations` selects them using a numeric semver comparison and is covered by `version-utils.spec.ts`. If the app version isn't valid semver (e.g. the dev `%VERSION%` placeholder), migrations are skipped. If a migration throws, `migrate()` logs the error and stops. `data_version` stays at the last successful migration, so the remaining ones run again on the next launch. Write migrations so they're safe to run more than once, and never overwrite user data. Installs with no recorded `data_version` run every migration from the start: that's both new installs and GitHub Pages installs from before 3.0.0, which never got a version injected.

### Logos

`LogoService` searches Brandfetch and builds logo.dev URLs (the API keys are in the environment files). Logos are converted to base64 data URLs and saved on `account.logo` so they work offline. Downloads go through `CorsProxyService`, which tries a direct fetch first and then falls back through a chain of public CORS proxies.

### Conventions

- **i18n:** ngx-translate with nested keys in `src/assets/i18n/{en,pt}.json`; `en` is the base language. Many services throw `Error`s whose message is a translation key (e.g. `'CRYPTO.INVALID_DECRYPTION_KEY'`), and the UI translates it. Keys used only dynamically are listed under `i18n-ally.keysInUse` in `.vscode/settings.json`. Adding a new language also means updating the `supportedLanguages` regex in `AppComponent.setupTranslate()`.
- **Logging:** `console.*` output is suppressed in production builds by `LoggingService`. There is a hidden "enable logging" action in the home menu.
- **Splash screen:** defined in `src/index.html`. Pages must call `GlobalUtils.hideSplashScreen()` once they're ready.
- **Lint rules:** component classes must end in `Page` or `Component`, and selectors use the `app-` prefix (kebab-case).
- **Style budget:** production builds fail if a single component stylesheet exceeds 4 kB (the warning is at 2 kB).
- **Firebase is optional:** `app.module.ts` only registers the Firebase providers when `environment.firebaseConfig` is set.
