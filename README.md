
![logo](resources/icon_256.png)
# AuthLeu
[![GitHub pages deploy](https://github.com/jlcvp/AuthLeu/actions/workflows/deploy_gh_pages.yml/badge.svg)](https://github.com/jlcvp/AuthLeu/actions/workflows/deploy_gh_pages.yml)  
An open-source, self-hosted alternative to Twilio's Authy, capable of syncing or operating fully offline. It can also serve as a substitute for TOTP 2FA apps like Google Authenticator and Microsoft Authenticator.

All the firebase integration is optional, and we currently don't offer a SaaS option (because rea$ons), but you change the `environment.x.ts` files to use your own firebase project or you can use the app fully offline, but in this case you will need to manually export and import your accounts between devices.

## Live version on github pages
https://jlcvp.github.io/AuthLeu

## Features
- [x] Progressive Web App (PWA) support.
- [x] Add 2FA accounts by scanning QR code or manually entering the secret key and account details.
- [x] Logo search
- [ ] Edit 2FA account details.
- [ ] Delete/disable/hide 2FA accounts.
- [x] Sync 2FA accounts across multiple devices using Firebase Firestore.
- [x] Import/Export 2FA accounts as a JSON file.
    - [x] Import/Export only selected 2FA accounts.
- [x] Encryption of 2FA Secret keys.
- [ ] Support for other 2FA algorithms like pure HOTP.
- [x] Internationalization
    - [x] English
    - [x] Portuguese (Brazil)
    - [ ] Other languages support (HELP WANTED)
- [x] Dark mode support.


## Screenshots
### Portrait layout
![Portrait](resources/screenshots/screenshot_1.png)
### Landscape layout
![Landscape](resources/screenshots/screenshot_2.png)