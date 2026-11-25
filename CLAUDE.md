# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AuthLeu is an open-source TOTP 2FA authenticator (an Authy / Google Authenticator alternative). It's an Ionic 8 + Angular 21 app (with Angular Fire 21 and Firebase 12) that ships only as a PWA; there's no native build, and Capacitor was removed in 3.0. It can sync accounts through Firebase (Auth + Firestore) or run fully offline using local storage.

## Commands

Angular 21 needs Node 20.19+ or 22.12+; CI and the deploy workflows use Node 22.

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
- **`package-lock.json` must only reference `https://registry.npmjs.org/`,** because CI and the deploy workflows install from there. If your npm uses another registry (e.g. a company mirror), npm writes that host into the `resolved` URLs of packages it adds. Rewrite those URLs to `https://registry.npmjs.org/` before committing; mirrors use the same paths and integrity hashes. Check with `grep '"resolved"' package-lock.json | grep -v registry.npmjs.org`.

## Build-time version injection (gotcha)

`npm run build` and `npm run build:githubpages` both run a pre-step (`resources/scripts/version-config.js`) through their `prebuild` / `prebuild:githubpages` scripts. If you add a build script, give it a matching `pre…` script: npm only runs `prebuild` before a script named exactly `build`. The script **rewrites `src/environments/environment*.ts` in place**, replacing `%VERSION%`, `%BUILD_DATE%` and `%COMMIT_HASH%` (the hash comes from `LAST_COMMIT_SHA`). Don't commit those substitutions; the placeholders must stay in source.

`ng serve` doesn't run this step, so in development `versionNumber` is the literal `"%VERSION%"` and no data migrations run. To test migrations locally, temporarily set `versionNumber` in `environment.ts`.

## Architecture

The app is NgModule-based: components are declared in modules with `standalone: false`, and templates use the built-in control flow (`@if`, `@for`). Import Ionic from `@ionic/angular`; `.vscode/settings.json` excludes the `/standalone` entry point from auto-import. The `prefer-standalone` and `prefer-inject` lint rules are off until the app moves to standalone components and `inject()`. There are two lazy routes:
- `login`: email/password Firebase login or "continue offline".
- `home`: guarded by `AuthenticationService.canActivate()`, which always passes in offline mode. `HomePageModule` declares all the UI components under `home/components/`.

### Account storage: one facade over local and remote providers

`services/accounts/account2fa.service.ts` (`Account2faService`) is the only thing the UI should talk to. At construction it picks a provider that implements `IAccount2FAProvider` (in `models/account2FA.model.ts`):
- **`LocalAccount2faService`**: keeps accounts in Ionic Storage under the `local_accounts` key and exposes them through a `BehaviorSubject`.
- **`RemoteAccount2faService`**: Firestore at `accounts2fa/{uid}/accounts`. The query is `active == true` ordered by `added`, which needs the composite index in `firestore.indexes.json`; access rules are in `firestore.rules`. Remote snapshots are **mirrored into the local service** (`updateAccountsBatch(accounts, replaceExisting=true)`), and the UI observes the local subject. That's how cached and offline reads keep working. Writes go directly to Firestore. When the listener fails, the error is published on `syncError$` (exposed by the facade; `HomePage` shows a toast) and the listener retries with a growing delay. Being offline doesn't count as a failure, because Firestore serves its cache.

The provider is chosen by `AppConfigService.isOfflineMode()`, which reads the `isOfflineMode` storage pref. `environment.isOfflineEnv` controls whether the login screen offers online login at all; the GitHub Pages build is offline-only.

### Secret encryption

- **A random data key encrypts the secrets** (AES-GCM; `encryptedSecret` + `iv` + `keyId` on `Account2FA`). The password only wraps that key: the wrapped key and its PBKDF2 parameters (600k iterations) are stored as a `VaultRecord` (`models/vault.model.ts`, `utils/crypto-utils.ts`). **The password is never stored.**
- **Encryption is set up when a vault record exists.** Providers store it (`getVaultRecord`/`createVaultRecord`/...): locally in Ionic Storage, or in Firestore at `accounts2fa/{uid}/vault/current` (plus a local copy), so other devices unlock with the same password. `createVaultRecord` returns an existing record instead of overwriting it.
- **`VaultService` holds the unlocked data key** (`dataKey$`). By default it remembers the key on the device as a CryptoKey that can't be exported (`vaultOptions.rememberUnlock`); otherwise the key lives in memory only and the password is asked on launch.
- **While the data key is locked, `LockScreenComponent` covers `HomePage`** (`isLocked`), e.g. on a new device or when the user turned on "Ask for Password on Open". In that mode, `AutoLockService` locks after `vaultOptions.autoLockMinutes` without interaction.
- **`Account2faService` is the only way to read and save accounts.** `getAccounts()` decrypts copies with the data key and emits again when it's locked or unlocked, so the providers always hold encrypted secrets. Saving (`addAccount`, `importAccounts`, `updateAccount`, `updateAccountsBatch`) goes through `toStoredAccount()`, which saves a copy that is always encrypted while a vault record exists, and throws `VAULT.LOCKED` rather than save a plaintext secret while locked.
- Encryption flows live in the same service: `enableEncryption`, `disableEncryption` (needs the password, saves plaintext through the provider directly), `changePassword` (rewraps the data key only), `unlock`, `restoreUnlock`, `lock`, `verifyPassword`.
- **2.x format:** 2.x encrypted each secret with a key derived from the password and a per-account `salt` (`isLegacyEncrypted`, `lock()`/`unlock()`), and stored the password under `_eok`. The 3.0.0 migration uses that password to set up the data key, re-encrypts the accounts (`upgradeLegacyAccounts`) and deletes it. Encrypted backups still use the 2.x format, so older versions can import them.
- `isLocked` means there's no valid base32 secret in memory. Unlocking deletes the encrypted fields, so use `account.copy()` before changing accounts that came from the observable.
- `home/password.service.ts` handles the password prompts and the weekly password check.

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
