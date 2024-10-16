import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { AlertController, IonModal, LoadingController, ModalController, NavController, ToastController } from '@ionic/angular';
import { firstValueFrom, Observable, tap } from 'rxjs';
import { Account2FA } from '../models/account2FA.model';
import { Account2faService } from '../services/accounts/account2fa.service';
import { LogoService } from '../services/logo.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';
import { LocalStorageService } from '../services/local-storage.service';
import { TranslateService } from '@ngx-translate/core';
import { GlobalUtils } from '../utils/global-utils';
import { AccountSelectModalComponent } from '../components/account-select-modal/account-select-modal.component';
import { AppConfigService } from '../services/app-config.service';
import { ENCRYPTION_OPTIONS_DEFAULT, EncryptionOptions, PASSWORD_CHECK_PERIOD } from '../models/encryption-options.model';
import { MigrationService } from '../services/migration.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {
  @ViewChild('popover') popover: any;
  @ViewChild(IonModal) modal!: IonModal;
  @ViewChild('qrscanner') qrscanner!: NgxScannerQrcodeComponent;

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.isLandscape = window.innerWidth > window.innerHeight
  }

  @HostListener('window:focus', ['$event'])
  onFocus(event: FocusEvent): void {
    // TODO: resume timer
    this.isWindowFocused = true
  }

  @HostListener('window:blur', ['$event'])
  onBlur(event: FocusEvent): void {
    // TODO: stop timer, camera, etc
    this.isWindowFocused = false
  }

  qrScannerOpts: ScannerQRCodeConfig = {
    isBeep: false,
    vibrate: 100,
    constraints: {
      video: {
        facingMode: 'environment'
      }
    }
  }

  accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  selectedAccount?: Account2FA
  searchTxt: string = ''
  draftLogoSearchTxt: string = ''
  searchLogoResults: any[] = []
  draftLogoURL: string = ''
  validations_form: FormGroup;

  manualInput: boolean = false
  isPopoverOpen: boolean = false
  isAddAccountModalOpen: boolean = false
  isScanActive: boolean = false
  isWindowFocused: boolean = true
  hasLockedAccounts: boolean = true
  versionInfo: any

  private encryptionOptions: EncryptionOptions = ENCRYPTION_OPTIONS_DEFAULT
  private systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  private isLandscape: boolean = false
  private currentDarkModePref: string = '';
  private shouldAlertAboutLockedAccounts: boolean = true
  private loading: HTMLIonLoadingElement | null = null

  constructor(
    private authService: AuthenticationService,
    private accountsService: Account2faService,
    private loadingCtrl: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private modalController: ModalController,
    private logoService: LogoService,
    private storageService: LocalStorageService,
    private configService: AppConfigService,
    private migrationService: MigrationService,
    private translateService: TranslateService,
    private navCtrl: NavController,
    formBuilder: FormBuilder
  ) {
    this.validations_form = formBuilder.group({
      label: new FormControl('', Validators.compose([
        Validators.required,
      ])),
      secret: new FormControl('', Validators.compose([
        Validators.required,
        Validators.minLength(8),
        Validators.pattern('^[A-Z2-7]+=*$')
      ])),
      tokenLength: new FormControl(6, Validators.compose([
        Validators.required,
        Validators.pattern('^[1-9]+[0-9]*$')
      ])),
      interval: new FormControl(30, Validators.compose([
        Validators.required,
        Validators.pattern('^[1-9]+[0-9]*$')
      ])),
    });

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

  async ngOnInit() {
    await this.migrationService.migrate()
    this.onWindowResize()
    this.setupPalette()
    GlobalUtils.hideSplashScreen()
    await this.setupEncryption()
    await this.loadAccounts()
    await this.configService.setFirstRun(false)
  }

  async logout() {
    const confirm = await this.confirmLogout()
    if (!confirm) {
      return
    }

    const message = await firstValueFrom(this.translateService.get('HOME.LOGGING_OUT'))
    await this.presentLoading(message)
    await this.accountsService.clearCache()
    await this.authService.logout()
    await this.storageService.clearStorage()
    //reload window
    await this.dismissLoading()
    await this.navCtrl.navigateRoot('/').then(() => {
      window.location.reload()
    })
  }

  selectAccount(account: any) {
    this.selectedAccount = account
    if (account && account.id) {
      this.storageService.set('lastSelectedAccountId', account.id)
    }
  }

  handleSearch(evt: any) {
    const searchTerm = evt?.detail?.value
    console.log({ evt, searchTerm })
    this.searchTxt = searchTerm
  }

  async handleSearchLogo(evt: any) {
    const searchTerm = evt?.detail?.value
    console.log({ evt, searchTerm })
    if (!searchTerm) {
      this.draftLogoURL = ''
      this.searchLogoResults = []
      return
    }
    const brandInfo = await this.logoService.searchServiceInfo(searchTerm)
    if (brandInfo && brandInfo.length > 0) {
      this.draftLogoURL = brandInfo[0].logo
      this.searchLogoResults = brandInfo.map(brand => brand.logo)
    }
    console.log({ brandInfo, draftLogoURL: this.draftLogoURL, searchTerm: this.draftLogoSearchTxt, results: this.searchLogoResults })
  }

  selectLogo(logoURL: string) {
    this.draftLogoURL = logoURL
  }

  async addAccountAction() {
    this.isAddAccountModalOpen = true
    this.scanCode()
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
      const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.EXPORTING_ACCOUNTS'))
      await this.presentLoading(message)
      await this.accountsService.exportAccounts(selectedAccounts, exportWithEncryption)
      await this.dismissLoading()
    } else {
      console.log("No accounts selected to export")
      const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.NO_ACCOUNTS_SELECTED_TO_EXPORT'))
      await this.showError(message)
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
            // check if imported accounts are encrypted
            const lockedAccounts = selectedAccounts.filter(account => account.isEncrypted)
            if (lockedAccounts.length > 0) {
              const password = await this.configService.getEncryptionKey()
              let currentPasswordWorks = false;
              if (password) {
                // try to decrypt using current password (if available)
                try {
                  console.log("Trying to decrypt accounts with saved password")
                  for (const account of selectedAccounts) {
                    if (account.isEncrypted) {
                      await account.unlock(password)
                    }
                  }
                  currentPasswordWorks = true
                } catch (error) {
                  console.warn("Unable to decrypt accounts with saved password", {error})
                }
              }

              if (!currentPasswordWorks) {
                try {
                  // ask for password
                  const password = await this.promptUnlockPassword(lockedAccounts)
                  if (!password) {
                    const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.NO_PASSWORD_PROVIDED'))
                    throw new Error(message)
                  }

                  try {
                    for (const account of selectedAccounts) {
                      if (account.isEncrypted) {
                        await account.unlock(password)
                      }
                    }
                  } catch (error) {
                    const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.INVALID_PASSWORD'))
                    throw new Error(message)
                  }
                } catch (error: any) {
                  const message = error && error.message || await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.GENERIC_IMPORT_ERROR'))
                  await this.showError(message)
                  return
                }
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
        } catch (error: any) {
          let errorKey = error && error.message || 'ACCOUNT_SYNC.ERROR.GENERIC_IMPORT_ERROR'
          const message = await firstValueFrom(this.translateService.get(errorKey))
          const header = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.IMPORT_ERROR_TITLE'))
          await this.showError(message, header)
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
    this.hidePopover()
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

  showPopover(e: Event) {
    this.popover.event = null
    this.popover.event = e;
    this.isPopoverOpen = false;
    setTimeout(() => {
      this.isPopoverOpen = true;
    }, 50);
  }

  private hidePopover() {
    this.isPopoverOpen = false;
  }

  onDidDismissModal(e: Event) {
    this.isAddAccountModalOpen = false
    this.manualInput = false
    this.isAddAccountModalOpen = false
    this.isScanActive = false
    if (this.qrscanner) {
      this.qrscanner.stop()
    }
    // clear form
    this.validations_form.reset()
    this.draftLogoURL = ''
    this.draftLogoSearchTxt = ''
    this.searchLogoResults = []
  }

  onWillDismissModal(e: Event) {
    console.log("Will dismiss modal", e)
    if (this.qrscanner) {
      console.log("STOP QR")
      this.qrscanner.stop()
    }
  }

  async closeAddAccountModal() {
    await this.modal.dismiss()
  }

  async createAccount(formValues: any) {
    console.log({ formValues })
    const logo = this.draftLogoURL
    await this.closeAddAccountModal()
    const newAccountDict = Object.assign(formValues, { logo, active: true })
    const account = Account2FA.fromDictionary(newAccountDict)
    console.log({ account2fa: account })
    const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ADDING_ACCOUNT'))
    await this.presentLoading(message)
    try {
      await this.accountsService.addAccount(account)
      await this.dismissLoading()
      // select new account
      this.selectAccount(account)
    } catch (error: any) {
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

  async scanCode() {
    // <ngx-scanner-qrcode #action="scanner" (event)="onEvent($event, action)"></ngx-scanner-qrcode>
    this.isScanActive = true
    const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.LOADING_CAMERA'))
    await this.presentLoading(message)
    try {
      await firstValueFrom(this.qrscanner.start())
    } catch (error) {
      // camera permission denial
      const header = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.ERROR_CAMERA_HEADER'))
      const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.ERROR_CAMERA_MESSAGE'))
      await this.dismissLoading()
      await this.showError(message, header)
      this.manualInput = true
      this.isScanActive = false
      return
    }

    const devices = (await firstValueFrom(this.qrscanner.devices)).filter(device => device.kind === 'videoinput')
    console.log({ devices })
    // find back camera
    let backCamera = devices.find(device => device.label.toLowerCase().includes('back camera'))
    if (!backCamera) {
      backCamera = devices.find(device => device.label.toLowerCase().match(/.*back.*camera.*/))
    }

    if (backCamera && backCamera.deviceId) {
      console.log("using device", { backCamera })
      await this.qrscanner.playDevice(backCamera.deviceId)
    }
    await this.dismissLoading()
  }

  async onQRCodeScanned(evt: ScannerQRCodeResult[], qrscanner: NgxScannerQrcodeComponent) {
    try {
      await qrscanner.stop()
      await this.qrscanner.stop()
    } catch (error) {
      console.error("Error stopping scanner", error)
    }
    this.processQRCode(evt && evt[0]?.value || '')
    // give time for the scanner to stop
    setTimeout(() => {
      this.isScanActive = false
    }, 200);
  }

  async cycleCamera() {
    console.log("cycle camera")
    const current = this.qrscanner.deviceIndexActive
    console.log({ current })
    const devices = await firstValueFrom(this.qrscanner.devices)
    console.log({ devices })
    const next = (current + 1) % devices.length
    const nextDevice = devices[next]
    this.qrscanner.playDevice(nextDevice.deviceId)
  }

  manualInputAction() {
    if (this.qrscanner) {
      console.log("STOP QR Reading")
      this.qrscanner.stop()
    }
    this.isScanActive = false;
    this.manualInput = true
  }

  private async processQRCode(evt: string) {
    // The URI format and params is described in https://github.com/google/google-authenticator/wiki/Key-Uri-Format
    // otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30
    try {
      const account = Account2FA.fromOTPAuthURL(evt)
      console.log({ account })

      this.validations_form.controls['label'].setValue(account.label)
      this.validations_form.controls['secret'].setValue(account.secret)
      this.validations_form.controls['tokenLength'].setValue(account.tokenLength)
      this.validations_form.controls['interval'].setValue(account.interval)
      // service name inferred from issuer or label
      const serviceName = account.issuer || account.label.split(':')[0]
      const event = { detail: { value: serviceName } }
      this.handleSearchLogo(event)
    } catch (error) {
      const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.INVALID_QR_CODE'))
      console.error("Error processing QR code", error)
      const toast = await this.toastController.create({
        message,
        duration: 2000,
        color: 'danger'
      })
      await toast.present()
    }
    this.manualInput = true
  }

  private confirmLogout(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
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
      const lockedAccounts = accounts.filter(account => account.isLocked)
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

  private async setupEncryption(): Promise<void> {
    /**
     * While setting up the encryption, app will follow the flow below:
     * 0. Load encryption options
     * 1. If encryption is active, check saved password
     *  1.1 If password is not set, show password setup prompt
     *    1.1.1 If password setup is cancelled or failed, show error message, deactivate encryption and exit setup flow
     *    1.1.2 If password setup is successful, update last password check timestamp and proceed to 1.2
     *  1.2 If password is set:
     *    1.2.1 If periodic password check is enabled, and it is time to perform a check:
     *      1.2.1.1 If the check succeeds, update the last password check timestamp
     *      1.2.1.2 If the check fails, alert user about the inability of decrypt accounts on other devices if password is lost
     * 2. If encryption is not active, check if alert to activate encryption is enabled
     *  2.1 If alert is enabled, show alert to activate encryption
     *    2.1.1 If user chooses to enable encryption, go to 1.1
     *    2.1.2 If user chooses to enable encryption later, check if it selected to not show the alert again and save the preference
     */

    this.encryptionOptions = await this.configService.getEncryptionOptions() // step 0
    // set page properties
    console.log("Encryption Options:",{ encryptionOptions: this.encryptionOptions })
    if(this.isEncryptionActive) { // step 1
      const password = await this.configService.getEncryptionKey()
      if(!password) { // 1.1
        const success = await this.setupNewPassword() // 1.1
        if(!success) { // 1.1.1
          // Deactivate encryption
          await this.deactivateEncryption()
          // Show failed password setup message
          await this.showFailedPasswordSetupAlert()
          return // exit encryption setup flow
        }
      }

      // 1.2
      if (this.shouldPeriodicCheckPassword) { // 1.2.1
        console.log("Starting periodic password check")
        await this.periodicPasswordCheck()
      } 
    } 
  }

  private async activateEncryption(): Promise<void> {
    const success = await this.setupNewPassword()
    if(!success) {
      this.setEncryptionActive(false)
      return
    }
    try {
      await this.accountsService.encryptAccounts()
    } catch (error) {
      console.error("Error encrypting accounts", error)
      return
    }
    console.log("accounts encrypted")
    this.setEncryptionActive(true)
  }

  private async deactivateEncryption() {
    const password = await this.configService.getEncryptionKey()
    if(password) {
      await this.accountsService.decryptAccounts()
      console.log("accounts decrypted")
    }
    await this.configService.clearEncryptionKey()
    this.setEncryptionActive(false)
  }

  private async setEncryptionActive(active: boolean) {
    this.encryptionOptions.encryptionActive = active
    this.encryptionOptions.shouldPerformPeriodicCheck = active
    await this.saveEncryptionOptions()
  }

  private async showFailedPasswordSetupAlert() {
    const title = await firstValueFrom(this.translateService.get('HOME.ERRORS.PASSWORD_NOT_SET_TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.PASSWORD_NOT_SET'))
    this.showError(message, title)
  }

  private async setupNewPassword(): Promise<boolean> {
    const passwordData = await this.promptPassword()
    if(passwordData && passwordData.password && passwordData.password === passwordData.passwordConfirmation) {
      await this.configService.setEncryptionKey(passwordData.password)
      await this.configService.setLastPasswordCheck()
      return true // 1.1.2
    }
    return false // 1.1.1
  }

  private async promptPassword(): Promise<{password: string, passwordConfirmation: string}> {
    const title = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_MESSAGE'))
    const passwordPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_PLACEHOLDER'))
    const passwordConfirmationPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRMATION_PLACEHOLDER'))
    const cancelText = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CANCEL'))
    const okText = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRM'))
    
    const alert = await this.alertController.create({
      header: title,
      message,
      backdropDismiss: false,
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: passwordPlaceholder
        },
        {
          name: 'passwordConfirmation',
          type: 'password',
          placeholder: passwordConfirmationPlaceholder
        }
      ],
      buttons: [
        {
          text: cancelText,
          role: 'cancel'
        }, {
          text: okText,
          handler: (data) => {
            return { password: data.password, passwordConfirmation: data.passwordConfirmation }
          }
        }
      ]
    })
    await alert.present()

    const { data } = await alert.onDidDismiss()
    if(!data) {
      return { password: '', passwordConfirmation: '' }
    }
    return data.values
  }

  private async periodicPasswordCheck() {
    const lastCheck = await this.configService.getLastPasswordCheck()
    const nextCheck = lastCheck + PASSWORD_CHECK_PERIOD
    const now = Date.now()
    console.log({ lastCheck, nextCheck, now })
    if(now >= nextCheck) { // 1.2.1
      const checkSuccess = await this.presentPasswordCheckAlert()
      if(checkSuccess) { // 1.2.1.1
        console.log('password check success')
        await this.configService.setLastPasswordCheck()
      } else { // 1.2.1.2
        await this.alertUserAboutInabilityToRecoverPassword()
      }
    }
  }

  private async alertUserAboutInabilityToRecoverPassword() {
    const title = await firstValueFrom(this.translateService.get('HOME.PASSWORD_RECOVERY_ALERT.TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.PASSWORD_RECOVERY_ALERT.MESSAGE'))
    await this.showError(message, title)
  }

  private async presentPasswordCheckAlert(): Promise<boolean> {
    const title = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MESSAGE'))
    const confirm = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.CONFIRM'))
    const cancelLabel = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
    const passwordPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRMATION_PLACEHOLDER'))
    const alert = await this.alertController.create({
      header: title,
      message,
      backdropDismiss: false,
      inputs: [
        {
          type: 'password',
          name: 'password',
          placeholder: passwordPlaceholder
        }
      ],
      buttons: [
        {
          text: cancelLabel,
          role: 'cancel'
        },
        {
          text: confirm,
          role: 'confirm',
          handler: (data) => {
            return data.password
          }
        }
      ]
    })
    await alert.present()

    const { data, role } = await alert.onDidDismiss()
    if (role === 'confirm') {
      console.log('password check', { data })
      const password = data.values.password
      if(password !== await this.configService.getEncryptionKey()) {
        const tryAgain = await this.presentPasswordCheckMismatchAlert()
        if(tryAgain) {
          return await this.presentPasswordCheckAlert()
        }
      } else {
        return true
      }
    }
    return false
  }

  private async presentPasswordCheckMismatchAlert(): Promise<boolean> {
    const title = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MISMATCH.TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MISMATCH.MESSAGE'))
    const tryAgainLabel = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MISMATCH.TRY_AGAIN'))
    const cancelLabel = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
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
          text: tryAgainLabel,
          role: 'try_again'
        }
      ]
    })
    await alert.present()
    const { role } = await alert.onDidDismiss()
    if(role === 'try_again') {
      return true
    }
    return false
  }

  private async promptUnlockPassword(lockedAccounts: Account2FA[]): Promise<string> {
    if(!lockedAccounts.some(account => account.isLocked)) {
      const message = await firstValueFrom(this.translateService.get('HOME.ASK_PASSWORD.ERROR_NOT_LOCKED'))
      throw new Error(message)
    }
    
    let success = false
    let password = ''

    do {
      password = await this.promptForPassword()
      if (!password) {
        break
      } else {
        try {
          for(const lockedAccount of lockedAccounts) {
            await lockedAccount.unlock(password)
          }
          success = true
        } catch (error) {
          const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.INVALID_PASSWORD'))
          await this.showError(message)
        }
      }
    } while (!success);

    return password
  }

  private async promptForPassword(): Promise<string> {
    const message = await firstValueFrom(this.translateService.get('HOME.ASK_PASSWORD.MESSAGE'))
    const confirm = await firstValueFrom(this.translateService.get('HOME.ASK_PASSWORD.CONFIRM'))
    const cancelLabel = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
    const passwordPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRMATION_PLACEHOLDER'))
    const alert = await this.alertController.create({
      message,
      backdropDismiss: false,
      inputs: [
        {
          type: 'password',
          name: 'password',
          placeholder: passwordPlaceholder
        }
      ],
      buttons: [
        {
          text: cancelLabel,
          role: 'cancel'
        },
        {
          text: confirm,
          role: 'confirm',
          handler: (data) => {
            return data.password
          }
        }
      ]
    })
    await alert.present()
    const { data } = await alert.onDidDismiss()
    if(data && data.values) {
      return data.values.password
    }
    return ''
  }

  private async handleAccountsLocked(lockedAccounts: Account2FA[]): Promise<void> {
    if(await this.alertAccountsLocked()) { // user wants to informPassword
      const password = await this.promptUnlockPassword(lockedAccounts)
      if(password) { // user provided the correct password
        // save password and enable encryption
        await this.configService.setEncryptionKey(password)
        await this.configService.setLastPasswordCheck()
        await this.setEncryptionActive(true)
        this.hasLockedAccounts = false
      }
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

  async showVersionInfo(): Promise<void> {
    const versionInfo = this.configService.versionInfo
    const title = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.VERSION_INFO_TITLE'))
    const versionLabel = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.VERSION_LABEL'))
    const buildDateLabel = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.VERSION_DATE'))
    const gitHashLabel = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.GIT_HASH'))
    const message = `
    <p>${versionLabel}: ${versionInfo.versionName}</p>
    <p>${buildDateLabel}: ${versionInfo.buildDate}</p>
    <p>${gitHashLabel}: ${versionInfo.commitHash}</p>`

    await this.showError(message, title)
  }

  private async showError(message: string, header?: string): Promise<void> {
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
    if(this.loading != null) {
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
    if(this.loading) {
      await this.loading.dismiss()
      this.loading = null
    }
  }
}