# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AuthLeu is an open-source TOTP 2FA authenticator (an Authy / Google Authenticator alternative). It's an Ionic 8 + Angular 18 app that ships mainly as a PWA. It can sync accounts through Firebase (Auth + Firestore) or run fully offline using local storage. Capacitor is configured, but there are no native platform projects in the repo.

## Commands

```bash
npm start                    # ng serve (development config, environment.ts)
npm run build                # production build -> www/ (environment.prod.ts, Firebase-backed)
npm run build:githubpages    # GitHub Pages build (environment.githubpages.ts, offline env, relative base href)
npm run lint                 # angular-eslint over src/**/*.ts and src/**/*.html
npm test                     # Karma + Jasmine in Chrome, watch mode
npx ng test --watch=false --browsers=ChromeHeadless                      # single headless run
npx ng test --include src/app/path/to/file.spec.ts                       # run a single spec file
npm run translations:check   # verify every key in en.json exists in all other i18n files
```

Test coverage is minimal: `src/app/app.component.spec.ts` is the only spec.

## CI requirements for PRs to `main`

- **The `package.json` version must be bumped.** The version-check workflow fails otherwise.
- **`npm run translations:check` must pass.** Any key added to `src/assets/i18n/en.json` must also be added to `pt.json` (and to any other locale file).
- Pushing to `main` deploys to both GitHub Pages and Firebase Hosting (project `authleu`). PRs from the same repo get a Firebase preview channel.

## Build-time version injection (gotcha)

`npm run build` runs a `prebuild` step (`resources/scripts/version-config.js`). That script **rewrites `src/environments/environment*.ts` in place**, replacing `%VERSION%`, `%BUILD_DATE%` and `%COMMIT_HASH%` (the hash comes from `LAST_COMMIT_SHA`). Don't commit those substitutions; the placeholders must stay in source.

`ng serve` doesn't run this step, so in development `versionNumber` is the literal `"%VERSION%"` and no data migrations run. To test migrations locally, temporarily set `versionNumber` in `environment.ts`.

## Architecture

The app is NgModule-based (not standalone). Import Ionic from `@ionic/angular`; `.vscode/settings.json` excludes the `/standalone` entry point from auto-import. There are two lazy routes:
- `login`: email/password Firebase login or "continue offline".
- `home`: guarded by `AuthenticationService.canActivate()`, which always passes in offline mode. `HomePageModule` declares all the UI components under `home/components/`.

### Account storage: one facade over local and remote providers

`services/accounts/account2fa.service.ts` (`Account2faService`) is the only thing the UI should talk to. At construction it picks a provider that implements `IAccount2FAProvider` (in `models/account2FA.model.ts`):
- **`LocalAccount2faService`**: keeps accounts in Ionic Storage under the `local_accounts` key and exposes them through a `BehaviorSubject`.
- **`RemoteAccount2faService`**: Firestore at `accounts2fa/{uid}/accounts`. The query is `active == true` ordered by `added`, which needs the composite index in `firestore.indexes.json`; access rules are in `firestore.rules`. Remote snapshots are **mirrored into the local service** (`updateAccountsBatch(accounts, replaceExisting=true)`), and the UI observes the local subject. That's how cached and offline reads keep working. Writes go directly to Firestore.

The provider is chosen by `AppConfigService.isOfflineMode()`, which reads the `isOfflineMode` storage pref. `environment.isOfflineEnv` controls whether the login screen offers online login at all; the GitHub Pages build is offline-only.

### Secret encryption

- `Account2FA` holds either a plaintext `secret` or the `encryptedSecret` + `iv` + `salt` triple. Encryption is AES-GCM with a PBKDF2-derived key (`utils/crypto-utils.ts`).
- `isLocked` means there's no valid base32 secret in memory. `lock()` and `unlock()` change the instance in place.
- `Account2faService.getAccounts()` decrypts accounts in memory using the stored password (storage key `_eok`).
- `updateAccount()` and `updateAccountsBatch()` blank the plaintext `secret` before saving any account that has encrypted fields. Keep that invariant: plaintext secrets must never be saved for encrypted accounts.
- Use `account.copy()` before changing accounts that came from the observable.
- `home/password.service.ts` handles password setup, the unlock prompt, and the weekly password check.

### Data migrations

`MigrationService.migrate()` runs at the start of `HomePage.ngOnInit` and shows progress text on the splash screen. To add a migration:
1. Add the version to the `AppVersion` enum (`models/app-version.enum.ts`).
2. Add a `case` in `runMigration`, along with a `migrateToVx_y_z()` method.

Migrations run for enum versions where `stored data_version < version <= app version`. **The comparison is a plain string comparison**, not semver.

### Logos

`LogoService` searches Brandfetch and builds logo.dev URLs (the API keys are in the environment files). Logos are converted to base64 data URLs and saved on `account.logo` so they work offline. Downloads go through `CorsProxyService`, which tries a direct fetch first and then falls back through a chain of public CORS proxies.

### Conventions

- **i18n:** ngx-translate with nested keys in `src/assets/i18n/{en,pt}.json`; `en` is the base language. Many services throw `Error`s whose message is a translation key (e.g. `'CRYPTO.INVALID_DECRYPTION_KEY'`), and the UI translates it. Keys used only dynamically are listed under `i18n-ally.keysInUse` in `.vscode/settings.json`. Adding a new language also means updating the `supportedLanguages` regex in `AppComponent.setupTranslate()`.
- **Logging:** `console.*` output is suppressed in production builds by `LoggingService`. There is a hidden "enable logging" action in the home menu.
- **Splash screen:** defined in `src/index.html`. Pages must call `GlobalUtils.hideSplashScreen()` once they're ready.
- **Lint rules:** component classes must end in `Page` or `Component`, and selectors use the `app-` prefix (kebab-case).
- **Style budget:** production builds fail if a single component stylesheet exceeds 4 kB (the warning is at 2 kB).
- **Firebase is optional:** `app.module.ts` only registers the Firebase providers when `environment.firebaseConfig` is set.
