import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { AlertController, IonPopover, LoadingController, ModalController, NavController, SearchbarCustomEvent, ToastController } from '@ionic/angular';
import { distinctUntilChanged, filter, firstValueFrom, map, Observable, tap } from 'rxjs';
import { Account2FA } from '../models/account2FA.model';
import { Account2faService } from '../services/accounts/account2fa.service';
import { LocalStorageService } from '../services/local-storage.service';
import { TranslateService } from '@ngx-translate/core';
import { GlobalUtils } from '../utils/global-utils';
import { AccountSelectModalComponent } from './components/account-select-modal/account-select-modal.component';
import { AppConfigService } from '../services/app-config.service';
import { ENCRYPTION_OPTIONS_DEFAULT, EncryptionOptions } from '../models/encryption-options.model';
import { VAULT_OPTIONS_DEFAULT } from '../models/vault.model';
import { MigrationService } from '../services/migration.service';
import { LoggingService } from '../services/logging.service';
import { AppVersionInfo } from '../models/app-version.enum';
import { PasswordService } from './password.service';
import { AccountModalComponent } from './components/account-modal/account-modal.component';
import { AboutModalComponent } from './components/about-modal/about-modal.component';
import { AutoLockService } from '../services/auto-lock.service';

@Component({
    selector: 'app-home',
    templateUrl: 'home.page.html',
    styleUrls: ['home.page.scss'],
    standalone: false
})
export class HomePage implements OnInit {
  @ViewChild('popover') popover!: IonPopover;

  @HostListener('window:resize')
  onWindowResize() {
    this.isLandscape = window.innerWidth > window.innerHeight
  }

  accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  selectedAccount?: Account2FA
  searchTxt: string = ''

  isWindowFocused: boolean = true
  hasLockedAccounts: boolean = true
  versionInfo: AppVersionInfo

  private encryptionOptions: EncryptionOptions = { ...ENCRYPTION_OPTIONS_DEFAULT }
  private systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  private isLandscape: boolean = false
  private currentDarkModePref: string = '';
  private shouldAlertAboutLockedAccounts: boolean = true
  private loading: HTMLIonLoadingElement | undefined = undefined

  constructor(
    private authService: AuthenticationService,
    private accountsService: Account2faService,
    private loadingCtrl: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private modalController: ModalController,
    private storageService: LocalStorageService,
    private configService: AppConfigService,
    private migrationService: MigrationService,
    private translateService: TranslateService,
    private loggingService: LoggingService,
    private passwordService: PasswordService,
    private navCtrl: NavController,
    private autoLock: AutoLockService,
  ) {
    this.versionInfo = this.configService.versionInfo
  }

  get accountListType() {
    return this.isLandscape ? 'list' : 'grid'
  }

  get layoutOrientationClass() {
    return {
      'landscape': this.isLandscape,
      'portrait': !this.isLandscape
    }
  }

  get darkModeLabel() {
    switch (this.currentDarkModePref) {
      case 'light':
        return 'CONFIG_MENU.COLOR_MODE_LIGHT'
      case 'dark':
        return 'CONFIG_MENU.COLOR_MODE_DARK'
      default:
        return 'CONFIG_MENU.COLOR_MODE_SYSTEM'
    }
  }

  // Encryption UI properties
  get isEncryptionActive() {
    return this.encryptionOptions.encryptionActive
  }

  get shouldPeriodicCheckPassword() {
    return this.encryptionOptions.shouldPerformPeriodicCheck
  }

  /** Whether encryption is set up but the data key is locked, so the lock screen covers the app */
  get isLocked(): boolean {
    return this.hasVaultRecord && !this.accountsService.isUnlocked
  }

  // Unlock settings, when encryption is set up
  hasVaultRecord = false
  askPasswordOnOpen = false
  autoLockMinutes = VAULT_OPTIONS_DEFAULT.autoLockMinutes
  readonly autoLockChoices = [1, 5, 15, 0] // 0 = never

  async ngOnInit() {
    await this.migrationService.migrate()
    this.onWindowResize()
    this.setupPalette()
    GlobalUtils.hideSplashScreen()
    await this.setupEncryption()
    await this.loadAccounts()
    this.watchSyncErrors()
    this.autoLock.start()
    await this.configService.setFirstRun(false)
  }

  async logout() {
    const confirm = await this.confirmLogout()
    if (!confirm) {
      return
    }

    const message = await firstValueFrom(this.translateService.get('HOME.LOGGING_OUT'))
    await this.presentLoading(message)
    // Run every step even if one fails (e.g. clearing the Firestore cache while another tab uses it),
    // so a single failure can't leave the session or the local data behind
    const steps = [
      () => this.accountsService.clearCache(),
      () => this.authService.logout(),
      () => this.storageService.clearStorage(),
    ]
    for (const step of steps) {
      try {
        await step()
      } catch (error) {
        console.error("Error signing out", error)
      }
    }
    //reload window
    await this.dismissLoading()
    await this.navCtrl.navigateRoot('/').then(() => {
      window.location.reload()
    })
  }

  selectAccount(account: Account2FA) {
    this.selectedAccount = account
    if (account && account.id) {
      this.storageService.set('lastSelectedAccountId', account.id)
    }
  }

  handleSearch(evt: SearchbarCustomEvent) {
    const searchTerm = evt?.detail?.value
    console.log({ evt, searchTerm })
    this.searchTxt = searchTerm ?? ''
  }

  async addAccountAction() {
    // show modal
    const modal = await this.modalController.create({
      component: AccountModalComponent,
      backdropDismiss: false
    })

    await modal.present()
    const { data, role } = await modal.onWillDismiss();

    if (role === 'added' && data) {
      const newAccount = data as Account2FA
      await this.createAccount(newAccount)
    }
  }

  async exportAccountAction() {
    const accounts = await firstValueFrom(this.accounts$)
    let exportWithEncryption = false
    if(this.isEncryptionActive) {
      // present alert to ask the user if they want to export accounts encrypted or not
      const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.EXPORT_ENCRYPTED_ACCOUNTS'))
      const encryptedLabel = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ENCRYPTED'))
      const unencryptedLabel = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.UNENCRYPTED'))

      const alert = await this.alertController.create({
        message,
        buttons: [
          {
            text: encryptedLabel,
            role: 'encrypted'
          },
          {
            text: unencryptedLabel,
            role: 'cancel'
          }
        ]
      })
      await alert.present()
      const { role } = await alert.onDidDismiss()
      if(role == 'encrypted') {
        exportWithEncryption = true
      } 
    }

    const modalTitle = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.EXPORT_ACCOUNTS_MODAL_TITLE'))
    const confirmText = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.EXPORT_ACCOUNTS_MODAL_ACTION'))
    const modal = await this.modalController.create({
      component: AccountSelectModalComponent,
      componentProps: {
        accounts,
        title: modalTitle,
        confirmText 
      },
    })
    modal.present()
    const { data, role } = await modal.onWillDismiss();
    if (role === 'cancel') {
      return
    }

    const selectedAccounts = data ? data as Account2FA[] : undefined
    if (selectedAccounts && selectedAccounts.length > 0) {
      console.log("Selected accounts to export", { selectedAccounts })
      // encrypted backups are encrypted with the password, which isn't stored
      let password: string | undefined
      if (exportWithEncryption) {
        password = await this.passwordService.promptUnlockPassword()
        if (!password) {
          return
        }
        if (!(await this.accountsService.verifyPassword(password))) {
          const invalidPasswordMessage = await firstValueFrom(this.translateService.get('HOME.ERRORS.INVALID_PASSWORD'))
          await this.showAlert(invalidPasswordMessage)
          return
        }
      }
      const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.EXPORTING_ACCOUNTS'))
      await this.presentLoading(message)
      try {
        await this.accountsService.exportAccounts(selectedAccounts, password)
        await this.dismissLoading()
      } catch (error) {
        console.error("Error exporting accounts", error)
        await this.dismissLoading()
        const errorMessage = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.GENERIC_EXPORT_ERROR'))
        await this.showAlert(errorMessage)
      }
    } else {
      console.log("No accounts selected to export")
      const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.NO_ACCOUNTS_SELECTED_TO_EXPORT'))
      await this.showAlert(message)
    }
  }

  async importAccountAction() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.click()
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        let message = await firstValueFrom(this.translateService.get('HOME.LOADING_ACCOUNTS_FILE'))
        await this.presentLoading(message)
        try {
          const accounts = await this.accountsService.readAccountsFromFile(file)
          input.remove()
          const title = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.IMPORT_ACCOUNTS_MODAL_TITLE'))
          const confirmText = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.IMPORT_ACCOUNTS_MODAL_ACTION'))
          const modal = await this.modalController.create({
            component: AccountSelectModalComponent,
            componentProps: {
              accounts,
              title,
              confirmText
            },
          })
          await this.dismissLoading()
          modal.present()
          const { data, role } = await modal.onWillDismiss();
          if (role === 'cancel') {
            return
          }
          const selectedAccounts = data ? data as Account2FA[] : undefined
          if (selectedAccounts && selectedAccounts.length > 0) {
            // backups are encrypted with a password, in the format 2.x uses
            const lockedAccounts = selectedAccounts.filter(account => account.isLegacyEncrypted)
            if (lockedAccounts.length > 0) {
              const password = await this.promptUnlockPassword(lockedAccounts)
              if (!password) {
                const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.NO_PASSWORD_PROVIDED'))
                await this.showAlert(message)
                return
              }
            }

            // import the accounts
            message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.IMPORTING_ACCOUNTS'))
            await this.presentLoading(message)
            console.log({data, selectedAccounts})
            await this.accountsService.importAccounts(selectedAccounts)
            await this.dismissLoading()
          } else {
            throw new Error("ACCOUNT_SYNC.ERROR.NO_ACCOUNTS_SELECTED_TO_IMPORT")
          }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
          await this.dismissLoading() // the loading overlay can't be dismissed by the user
          const errorKey = error && error.message || 'ACCOUNT_SYNC.ERROR.GENERIC_IMPORT_ERROR'
          const message = await firstValueFrom(this.translateService.get(errorKey))
          const header = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.IMPORT_ERROR_TITLE'))
          await this.showAlert(message, header)
        }
      }
    }
  }

  async encryptionActiveToggle() {
    if (this.isEncryptionActive) {
      await this.deactivateEncryption()
    } else {
      await this.activateEncryption()
    }
    this.popover?.dismiss()
  }

  async unlockAccountsAction() {
    this.shouldAlertAboutLockedAccounts = true
    await this.loadAccounts()
  }

  get encryptionMenuSlotLabel(): string {
    return this.isEncryptionActive ? 'CONFIG_MENU.ENCRYPTION_ACTIVE' : 'CONFIG_MENU.ENCRYPTION_INACTIVE'
  }
  
  get encryptionMenuSlotLabelColor(): string {
    return this.isEncryptionActive ? 'success' : 'danger'
  }

  async periodicCheckToggle() {
    this.encryptionOptions.shouldPerformPeriodicCheck = !this.shouldPeriodicCheckPassword
    await this.saveEncryptionOptions()
  }

  async saveEncryptionOptions() {
    await this.configService.setEncryptionOptions(this.encryptionOptions)
  }

  async createAccount(newAccount: Account2FA) {
    const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ADDING_ACCOUNT'))
    await this.presentLoading(message)
    try {
      await this.accountsService.addAccount(newAccount)
      await this.dismissLoading()
      // select new account
      this.selectAccount(newAccount)
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      await this.dismissLoading()
      const messageKey = error.message === 'INVALID_SESSION' ? 
        await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.INVALID_SESSION')) : 
        await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.ERROR_ADDING_ACCOUNT'))
      const message = await firstValueFrom(this.translateService.get(messageKey))
      const toast = await this.toastController.create({
        message: message,
        color: "danger",
        duration: 2000
      })
      await toast.present()
    }
  }

  async darkPaletteChange(selectedPalette: string) {
    await this.storageService.set('darkPalette', selectedPalette)
    this.currentDarkModePref = selectedPalette
    this.handleDarkPaletteChange()
  }

  private async setupPalette() {
    this.systemPrefersDark.addEventListener('change', (mediaQuery) => {
      if (this.currentDarkModePref !== 'system') {
        return
      }
      this.useDarkPalette(mediaQuery.matches)
    });
    const darkPalettePref = await this.storageService.get<string | undefined>('darkPalette')
    console.log({ darkPalettePref })
    this.currentDarkModePref = darkPalettePref || 'system'
    this.handleDarkPaletteChange()
  }

  private handleDarkPaletteChange() {
    switch (this.currentDarkModePref) {
      case 'light':
        this.useDarkPalette(false);
        break;
      case 'dark':
        this.useDarkPalette(true);
        break;
      default:
        const isCurrentlyDark = this.systemPrefersDark.matches;
        this.useDarkPalette(isCurrentlyDark)
        break;
    }
  }

  // Add or remove the "ion-palette-dark" class on the html element
  private useDarkPalette(isDark: boolean) {
    document.documentElement.classList.toggle('ion-palette-dark', isDark);
  }

  private confirmLogout(): Promise<boolean> {
    return new Promise(async (resolve) => {
      const title = await firstValueFrom(this.translateService.get('HOME.CONFIRM_LOGOUT_TITLE'))
      const message = await firstValueFrom(this.translateService.get('HOME.CONFIRM_LOGOUT_MESSAGE'))
      const yesBtnText = await firstValueFrom(this.translateService.get('HOME.CONFIRM_LOGOUT_YES'))
      const cancelBtnText = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
      const confirmPrompt = await this.alertController.create({
        header: title,
        message,
        buttons: [
          {
            text: cancelBtnText,
            role: 'cancel',
            handler: () => {
              resolve(false)
            }
          }, {
            text: yesBtnText,
            role: 'destructive',
            handler: () => {
              resolve(true)
            }
          }
        ]
      });
      await confirmPrompt.present()
    })
  }

  private async loadAccounts() {
    const loadingMsg = await firstValueFrom(this.translateService.get('HOME.LOADING_ACCOUNTS'))
    await this.presentLoading(loadingMsg)
    const accounts$ = (await this.accountsService.getAccounts()).pipe(tap(accounts => {
      // the lock screen unlocks the data key; a password can still decrypt the accounts 2.x encrypted
      const lockedAccounts = this.isLocked ? [] : accounts.filter(account => account.isLegacyEncrypted && account.isLocked)
      this.hasLockedAccounts = lockedAccounts.length > 0
      if(this.shouldAlertAboutLockedAccounts && this.hasLockedAccounts) {
        this.shouldAlertAboutLockedAccounts = false
        this.handleAccountsLocked(lockedAccounts)
      }
      this.handleAccountSelection(accounts)
      console.log("Accounts tapped", { accounts })
    }))
    
    await this.dismissLoading()
     
    this.accounts$ = accounts$
  }

  /** Tells the user each time syncing with the cloud starts failing (once, not on every retry) */
  private watchSyncErrors() {
    this.accountsService.syncError$.pipe(
      map(error => !!error),
      distinctUntilChanged(),
      filter(failing => failing),
    ).subscribe(() => this.showSyncErrorToast())
  }

  private async showSyncErrorToast() {
    const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.SYNC_FAILED'))
    const toast = await this.toastController.create({
      message,
      color: 'warning',
      duration: 5000
    })
    await toast.present()
  }

  private async setupEncryption(): Promise<void> {
    this.encryptionOptions = await this.configService.getEncryptionOptions()
    console.log("Encryption Options:",{ encryptionOptions: this.encryptionOptions })

    // encryption is set up when there's a data key record, which other devices may create or delete.
    // While a password 2.x stored remains, the 3.0.0 migration hasn't set up the data key yet
    const record = await this.accountsService.getVaultRecord()
    const migrationPending = !record && !!(await this.configService.getLegacyEncryptionPassword())
    if (!migrationPending && this.isEncryptionActive !== !!record) {
      await this.setEncryptionActive(!!record)
    }
    this.hasVaultRecord = !!record
    if (!record) {
      return
    }
    await this.loadUnlockSettings()

    // without a data key remembered on this device, the lock screen asks for the password
    if (await this.accountsService.restoreUnlock()) {
      await this.upgradeLegacyAccountsWithStoredPassword()
      if (this.shouldPeriodicCheckPassword) {
        console.log("Starting periodic password check")
        await this.passwordService.periodicPasswordCheck()
      }
    }
  }

  /** Called when the lock screen unlocks the data key */
  async onUnlocked() {
    await this.configService.setLastPasswordCheck() // the user just entered the password
    await this.upgradeLegacyAccountsWithStoredPassword()
  }

  private async loadUnlockSettings() {
    const { rememberUnlock, autoLockMinutes } = await this.configService.getVaultOptions()
    this.askPasswordOnOpen = !rememberUnlock
    this.autoLockMinutes = autoLockMinutes
  }

  async askPasswordOnOpenToggle() {
    this.askPasswordOnOpen = !this.askPasswordOnOpen
    await this.accountsService.setUnlockRemembered(!this.askPasswordOnOpen)
  }

  async autoLockChange(minutes: number) {
    this.autoLockMinutes = minutes
    await this.configService.setVaultOptions({ autoLockMinutes: minutes })
  }

  lockAction() {
    this.popover?.dismiss()
    this.accountsService.lock()
  }

  async changePasswordAction() {
    this.popover?.dismiss()
    const currentPassword = await this.passwordService.promptUnlockPassword('HOME.CHANGE_PASSWORD.CURRENT')
    if (!currentPassword) {
      return
    }
    if (!(await this.accountsService.verifyPassword(currentPassword))) {
      const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.INVALID_PASSWORD'))
      await this.showAlert(message)
      return
    }
    const newPassword = await this.passwordService.setupNewPassword('HOME.CHANGE_PASSWORD.NEW')
    if (!newPassword) {
      return
    }
    try {
      await this.accountsService.changePassword(currentPassword, newPassword)
    } catch (error) {
      console.error("Error changing the password", error)
      const message = await firstValueFrom(this.translateService.get('HOME.CHANGE_PASSWORD.FAILED'))
      await this.showAlert(message)
      return
    }
    const message = await firstValueFrom(this.translateService.get('HOME.CHANGE_PASSWORD.DONE'))
    const toast = await this.toastController.create({ message, duration: 2000 })
    await toast.present()
  }

  private async activateEncryption(): Promise<void> {
    const password = await this.passwordService.setupNewPassword()
    if(!password) {
      return
    }
    try {
      await this.accountsService.enableEncryption(password)
    } catch (error) {
      console.error("Error encrypting accounts", error)
      const messageKey = error instanceof Error && error.message === 'VAULT.INVALID_PASSWORD'
        ? 'HOME.ERRORS.ENCRYPTION_SET_UP_ELSEWHERE'
        : 'HOME.ERRORS.ENCRYPTION_FAILED'
      const message = await firstValueFrom(this.translateService.get(messageKey))
      await this.showAlert(message)
      return
    }
    console.log("accounts encrypted")
    this.hasVaultRecord = true
    await this.loadUnlockSettings()
    await this.setEncryptionActive(true)
  }

  private async deactivateEncryption() {
    const password = await this.passwordService.promptUnlockPassword()
    if(!password) {
      return
    }
    try {
      await this.accountsService.disableEncryption(password)
    } catch (error) {
      console.error("Error decrypting accounts", error)
      const invalidPassword = error instanceof Error && ['VAULT.INVALID_PASSWORD', 'CRYPTO.INVALID_DECRYPTION_KEY'].includes(error.message)
      const message = await firstValueFrom(this.translateService.get(invalidPassword ? 'HOME.ERRORS.INVALID_PASSWORD' : 'HOME.ERRORS.DECRYPTION_FAILED'))
      await this.showAlert(message)
      return
    }
    console.log("accounts decrypted")
    this.hasVaultRecord = false
    await this.setEncryptionActive(false)
  }

  private async setEncryptionActive(active: boolean) {
    this.encryptionOptions.encryptionActive = active
    this.encryptionOptions.shouldPerformPeriodicCheck = active
    await this.saveEncryptionOptions()
  }

  /** Asks for a password until it decrypts the given accounts, encrypted by 2.x or in a backup, or the user cancels */
  private async promptUnlockPassword(lockedAccounts: Account2FA[]): Promise<string> { // TODO: refactor this, and move to password service
    if(!lockedAccounts.some(account => account.isLocked)) {
      const message = await firstValueFrom(this.translateService.get('HOME.ASK_PASSWORD.ERROR_NOT_LOCKED'))
      throw new Error(message)
    }
    
    let success = false
    let password = ''

    do {
      password = await this.passwordService.promptUnlockPassword()
      if (!password) {
        break
      } else {
        try {
          for(const lockedAccount of lockedAccounts) {
            await lockedAccount.unlock(password)
          }
          success = true
        } catch {
          const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.INVALID_PASSWORD'))
          await this.showAlert(message)
        }
      }
    } while (!success);

    return password
  }

  private async handleAccountsLocked(lockedAccounts: Account2FA[]): Promise<void> {
    if(!(await this.alertAccountsLocked())) { // user wants to keep them locked
      return
    }

    // the accounts were encrypted by 2.x (e.g. on a device that hasn't updated yet): re-encrypt them with the data key
    const password = await this.promptUnlockPassword(lockedAccounts)
    if (!password) {
      return
    }
    try {
      if (!(await this.accountsService.getVaultRecord())) {
        await this.accountsService.enableEncryption(password)
        this.hasVaultRecord = true
        await this.loadUnlockSettings()
        await this.setEncryptionActive(true)
      }
      await this.accountsService.upgradeLegacyAccounts(password)
    } catch (error) {
      console.error("Error upgrading the accounts encrypted by 2.x", error)
      const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.ENCRYPTION_FAILED'))
      await this.showAlert(message)
    }
  }

  /** Re-encrypts the remaining accounts encrypted by 2.x with the password it stored, kept when it didn't unlock the data key */
  private async upgradeLegacyAccountsWithStoredPassword(): Promise<void> {
    const password = await this.configService.getLegacyEncryptionPassword()
    if (!password) {
      return
    }
    try {
      await this.accountsService.upgradeLegacyAccounts(password)
      await this.configService.clearLegacyEncryptionPassword()
    } catch (error) {
      console.warn("The password 2.x stored doesn't decrypt the remaining accounts", { error })
    }
  }

  private async handleAccountSelection(accounts: Account2FA[]): Promise<void> {
    const lastSelectedAccountId = await this.storageService.get<string>('lastSelectedAccountId')
    if (lastSelectedAccountId) {
      const selectedAccount = accounts.find(account => account.id === lastSelectedAccountId)
      if (selectedAccount) {
        this.selectAccount(selectedAccount)
      }
    }
  }

  private async alertAccountsLocked(): Promise<boolean> {
    const title = await firstValueFrom(this.translateService.get('HOME.ERRORS.ACCOUNTS_LOCKED_TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.ACCOUNTS_LOCKED'))
    const unlockLabel = await firstValueFrom(this.translateService.get('HOME.UNLOCK_ACCOUNTS'))
    const cancelLabel = await firstValueFrom(this.translateService.get('HOME.ASK_PASSWORD.KEEP_LOCKED'))

    const alert = await this.alertController.create({
      header: title,
      message,
      backdropDismiss: false,
      buttons: [
        {
          text: cancelLabel,
          role: 'cancel'
        },
        {
          text: unlockLabel,
          role: 'unlock'
        }
      ]
    })
    await alert.present()
    const { role } = await alert.onDidDismiss()
    const willInputPassword = role === 'unlock'
    return willInputPassword
  }

  async aboutAction(): Promise<void> {
    // show about modal
    const modal = await this.modalController.create({
      component: AboutModalComponent,
      backdropDismiss: true
    })
    await modal.present()
  }

  async enableLogging() {
    await this.loggingService.enableConsole()
  }

  private async showAlert(message: string, header?: string): Promise<void> {
    const title = header
    const okLabel = await firstValueFrom(this.translateService.get('HOME.OK'))
    const alert = await this.alertController.create({
      header: title,
      message,
      buttons: [okLabel]
    })
    await alert.present()
    await alert.onDidDismiss()
  }

  private async presentLoading(message: string): Promise<void> {
    // if loading is already present, update message
    if(this.loading != undefined) {
      this.loading.message = message
      return
    }

    // create new loading
    this.loading = await this.loadingCtrl.create({
      message,
      backdropDismiss: false
    })
    await this.loading.present()
  }

  private async dismissLoading(): Promise<void> {
    await this.loading?.dismiss()
    this.loading = undefined
  }
}