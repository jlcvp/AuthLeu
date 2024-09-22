import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { AlertController, IonModal, LoadingController, ModalController, NavController, ToastController } from '@ionic/angular';
import { concatMap, firstValueFrom, map, Observable } from 'rxjs';
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
import { ENCRYPTION_OPTIONS_PASSWORD_KEY, EncryptionOptions } from '../models/encryption-options.model';
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
  lockedAccount?: Account2FA
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
  isEncryptionActive: boolean = false
  shouldPeriodicCheckPassword: boolean = false
  shouldAlertToActivateEncryption: boolean = true
  versionInfo

  private systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  private isLandscape: boolean = false
  private currentDarkModePref: string = '';

  constructor(
    private authService: AuthenticationService,
    private accountsService: Account2faService,
    private loadingController: LoadingController,
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

  async ngOnInit() {
    this.onWindowResize()
    this.setupPalette()
    const loadingMsg = await firstValueFrom(this.translateService.get('HOME.LOADING_ACCOUNTS'))
    const loading = await this.loadingController.create({
      message: loadingMsg,
      backdropDismiss: false
    })
    GlobalUtils.hideSplashScreen()
    const encryptionOptions = await this.configService.getEncryptionOptions()
    if(encryptionOptions) {
      await this.setupEncryption(encryptionOptions)
    }
    await loading.present()
    await this.migrationService.migrate()
    await this.loadAccounts()
    await loading.dismiss()
  }

  async logout() {
    const confirm = await this.confirmLogout()
    if (!confirm) {
      return
    }

    const message = await firstValueFrom(this.translateService.get('HOME.LOGGING_OUT'))
    const loading = await this.loadingController.create({
      message,
      spinner: "circular",
      backdropDismiss: false
    })
    await loading.present()
    await this.accountsService.clearCache()
    await this.authService.logout()
    //reload window
    await loading.dismiss()
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
      const loading = await this.loadingController.create({
        message,
        backdropDismiss: false
      })
      await loading.present()
      await this.accountsService.exportAccounts(selectedAccounts)
      await loading.dismiss()
    } else {
      console.log("No accounts selected to export")
      const message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.NO_ACCOUNTS_SELECTED_TO_EXPORT'))
      const alert = await this.alertController.create({
        message,
        buttons: ['OK']
      })
      await alert.present()
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
        let loading = await this.loadingController.create({
          message,
          backdropDismiss: false
        })
        try {
          await loading.present()
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
          await loading.dismiss()
          modal.present()
          const { data, role } = await modal.onWillDismiss();
          if (role === 'cancel') {
            return
          }
          message = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.IMPORTING_ACCOUNTS'))
          loading = await this.loadingController.create({
            message,
            backdropDismiss: false
          })
          await loading.present()
          const selectedAccounts = data ? data as Account2FA[] : undefined
          console.log({data, selectedAccounts})
          if (selectedAccounts && selectedAccounts.length > 0) {
            await this.accountsService.importAccounts(selectedAccounts)
          } else {
            throw new Error("ACCOUNT_SYNC.ERROR.NO_ACCOUNTS_SELECTED_TO_IMPORT")
          }
          await loading.dismiss()
        } catch (error: any) {
          let errorKey = error && error.message || 'ACCOUNT_SYNC.ERROR.GENERIC_IMPORT_ERROR'
          const message = await firstValueFrom(this.translateService.get(errorKey))
          const header = await firstValueFrom(this.translateService.get('ACCOUNT_SYNC.ERROR.IMPORT_ERROR_TITLE'))
          const alert = await this.alertController.create({
            header,
            message,
            backdropDismiss: false,
            buttons: ['OK']
          })
          await loading.dismiss()
          await alert.present()
        }
      }
    }
  }

  async encryptionActiveToggle() {
    this.isEncryptionActive = !this.isEncryptionActive
    await this.saveEncryptionOptions()
  }

  get encryptionMenuSlotLabel(): string {
    return this.isEncryptionActive ? 'CONFIG_MENU.ENCRYPTION_ACTIVE' : 'CONFIG_MENU.ENCRYPTION_INACTIVE'
  }
  
  get encryptionMenuSlotLabelColor(): string {
    return this.isEncryptionActive ? 'success' : 'danger'
  }

  periodicCheckToggle() {
    this.shouldPeriodicCheckPassword = !this.shouldPeriodicCheckPassword
  }

  async saveEncryptionOptions() {
    await this.configService.setEncryptionOptions({
      encryptionActive: this.isEncryptionActive,
      shouldPerformPeriodicCheck: this.shouldPeriodicCheckPassword,
      shouldAlertToActivateEncryption: this.shouldAlertToActivateEncryption
    })
  }

  // async lockAccountAction() {
  //   const password = '1490'
  //   const accountSelected = this.selectedAccount
  //   console.log('account', { accountSelected })

  //   if (accountSelected) {
  //     const account = Account2FA.fromDictionary(accountSelected.typeErased()) // copy account
  //     try {
  //       console.log('account before', { accountSelected })
  //       await account.lock(password)
  //       this.lockedAccount = account
  //       console.log('account locked', { account })
        
  //     } catch (error) {
  //       console.error("Error locking account", error)

  //       const alert = await this.alertController.create({
  //         message,
  //         buttons: ['OK']
  //       })
  //       await alert.present()
  //     }
  //   }
  // }

  // async unlockAccountAction() {
  //   const password = '1490'
  //   const account = this.lockedAccount
  //   console.log('account before', { account })
  //   if(account) {
  //     try {
  //       await account.unlock(password)
  //       console.log('account unlocked', { account })
  //     } catch (error) {
  //       console.error("Error unlocking account", error)

  //       const alert = await this.alertController.create({
  //         message,
  //         buttons: ['OK']
  //       })
  //       await alert.present()
  //     }
  //   }
  // }

  showPopover(e: Event) {
    this.popover.event = null
    this.popover.event = e;
    this.isPopoverOpen = false;
    setTimeout(() => {
      this.isPopoverOpen = true;
    }, 50);
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
    const loading = await this.loadingController.create({
      message,
      backdropDismiss: false
    })
    await loading.present()
    try {
      await this.accountsService.addAccount(account)
      await loading.dismiss()
      // select new account
      this.selectAccount(account)
    } catch (error: any) {
      await loading.dismiss()
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
    const loading = await this.loadingController.create({
      message,
      backdropDismiss: false
    })
    await loading.present()
    try {
      await firstValueFrom(this.qrscanner.start())
    } catch (error) {
      // camera permission denial
      const header = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.ERROR_CAMERA_HEADER'))
      const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.ERROR_CAMERA_MESSAGE'))
      const alert = await this.alertController.create({
        header,
        message,
        buttons: ['OK']
      })
      await loading.dismiss()
      await alert.present()
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
    await loading.dismiss()
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
    const accounts$ = await this.accountsService.getAccounts()
    this.accounts$ = accounts$
  }

  private async unlockAccounts(): Promise<void> {
    const encryptionOptions = await this.configService.getEncryptionOptions()
    if(!encryptionOptions || !encryptionOptions.encryptionActive) {
      return
    }

    const password = await this.configService.getEncryptionKey()
    if(!password) {
      const errormessage = await firstValueFrom(this.translateService.get('HOME.ERRORS.UNABLE_TO_DECRYPT_PASSWORD_NOT_SET'))
      throw new Error(errormessage)
    } else {
      this.accounts$ = this.accounts$.pipe(concatMap(async accounts => {
        const unlockedAccounts = []
        for(const account of accounts) {
          if(account.isLocked) {
            try {
              await account.unlock(password)
              unlockedAccounts.push(account)
            } catch (error) {
              console.error("Error unlocking account", error)
            }
          } else {
            unlockedAccounts.push(account)
          }
        }
        return unlockedAccounts
      }))
    }
  }

  private async setupEncryption(encryptionOptions: EncryptionOptions) {
    // set page properties
    this.isEncryptionActive = encryptionOptions.encryptionActive
    this.shouldPeriodicCheckPassword = encryptionOptions.shouldPerformPeriodicCheck
    this.shouldAlertToActivateEncryption = encryptionOptions.shouldAlertToActivateEncryption
    if(this.isEncryptionActive) {
      const passwordSetupSuccess = await this.setupEncryptionPassword()
      if(!passwordSetupSuccess) {
        // Deactivate encryption
        this.isEncryptionActive = false
        
        // show error message
        const title = await firstValueFrom(this.translateService.get('HOME.ERRORS.PASSWORD_NOT_SET_TITLE'))
        const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.PASSWORD_NOT_SET'))
        const alert = await this.alertController.create({
          header: title,
          backdropDismiss: false,
          message,
          buttons: ['OK']
        })
        await alert.present()
        await alert.onDidDismiss()
      }
    } else {
      // alert to activate encryption
      if (this.shouldAlertToActivateEncryption) {
        await this.alertToActivateEncryption()
      }
    }

    // periodicCheck
  }

  private async setupEncryptionPassword(): Promise<boolean> {
    const password = await this.configService.getEncryptionKey()
    console.log({ password })
    if(!password) {
      // show password prompt
      const passwordData = await this.promptPassword()
      if(passwordData && passwordData.password && passwordData.password === passwordData.passwordConfirmation) {
        await this.configService.setEncryptionKey(passwordData.password)
        return true
      } else {
        if(!passwordData || (!passwordData.password && !passwordData.passwordConfirmation)) {
          return false
        }
        // show error message
        const message = await firstValueFrom(this.translateService.get('HOME.ERRORS.PASSWORD_MISMATCH'))
        const tryAgainLabel = await firstValueFrom(this.translateService.get('HOME.TRY_AGAIN'))
        const cancelLabel = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
        const alert = await this.alertController.create({
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
        if(role === 'cancel') {
          return false
        }
        // clear password and try again
        await this.configService.clearEncryptionKey()
        return await this.setupEncryptionPassword()
      }
    }
    return true
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

  async alertToActivateEncryption() {
    const title = await firstValueFrom(this.translateService.get('HOME.ENCRYPTION_ALERT.TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.ENCRYPTION_ALERT.MESSAGE'))
    const enableLabel = await firstValueFrom(this.translateService.get('HOME.ENCRYPTION_ALERT.ENABLE_ENCRYPTION'))
    const laterLabel = await firstValueFrom(this.translateService.get('HOME.ENCRYPTION_ALERT.LATER'))
    const alert = await this.alertController.create({
      header: title,
      message,
      backdropDismiss: false,
      inputs: [
        {
          type: 'checkbox',
          value: 'dontShowAgain',
          label: await firstValueFrom(this.translateService.get('HOME.ENCRYPTION_ALERT.DONT_SHOW_AGAIN'))
        }
      ],
      buttons: [
        {
          text: laterLabel,
          role: 'later',
          handler: (data) => {
            if(data && data[0] == 'dontShowAgain') {
              return { dontShowAgain: true }
            }
            return { dontShowAgain: false }
          }
        },
        {
          text: enableLabel,
          role: 'enable'
        }
      ]
    })
    await alert.present()

    const { data, role } = await alert.onDidDismiss()
    console.log('alert result', { data, role })

    if(data && data.dontShowAgain) {
      this.shouldAlertToActivateEncryption = false
      await this.saveEncryptionOptions()
    }

    if(role === 'enable') {
      const setupSuccess = await this.setupEncryptionPassword()
      if(setupSuccess) {
        this.isEncryptionActive = true
        await this.saveEncryptionOptions()
      }
    }
  }

  async showVersionInfo(): Promise<void> {
    const versionInfo = this.configService.versionInfo
    const title = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.VERSION_INFO_TITLE'))
    const versionLabel = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.VERSION_LABEL'))
    const buildDateLabel = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.VERSION_DATE'))
    const gitHashLabel = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.GIT_HASH'))
    const buttonLabel = await firstValueFrom(this.translateService.get('HOME.VERSION_INFO.OK_BUTTON'))
    const message = `
    <p>${versionLabel}: ${versionInfo.versionName}</p>
    <p>${buildDateLabel}: ${versionInfo.buildDate}</p>
    <p>${gitHashLabel}: ${versionInfo.commitHash}</p>`

    const alert = await this.alertController.create({
      header: title,
      message,
      buttons: [buttonLabel]
    })
    await alert.present()
  }

}