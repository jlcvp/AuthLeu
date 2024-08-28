import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { IonModal, LoadingController, ToastController } from '@ionic/angular';
import { firstValueFrom, Observable } from 'rxjs';
import { Account2FA } from '../models/account2FA.model';
import { Account2faService } from '../services/account2fa.service';
import { LogoService } from '../services/logo.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';
import { LocalStorageService } from '../services/local-storage.service';
import { GlobalUtils } from '../utils/global-utils';

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
    // resume timer
    console.log("Window focused")
    this.isWindowFocused = true
  }

  @HostListener('window:blur', ['$event'])
  onBlur(event: FocusEvent): void {
    // stop timer, camera, etc
    console.log("Window blurred")
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

  private systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  isLandscape: boolean = false
  accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  selectedAccount?: Account2FA
  searchTxt: string = ''
  draftLogoSearchTxt: string = ''
  searchLogoResults: any[] = []
  draftLogoURL: string = ''

  manualInput: boolean = false
  isPopoverOpen: boolean = false
  isAddAccountModalOpen: boolean = false
  isScanActive: boolean = false
  isWindowFocused: boolean = true
  validations_form: FormGroup;
  currentDarkModePref: string = '';
  supportsWebCredentialManagement: boolean = false

  constructor(
    private authService: AuthenticationService, 
    private accountsService: Account2faService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private logoService: LogoService,
    private storageService: LocalStorageService,
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
        return 'Claro'
      case 'dark':
        return 'Escuro'
      default:
        return 'Sistema'
    }
  }
  
  async ngOnInit() {
    this.onWindowResize()
    this.setupPalette()
    const loading = await this.loadingController.create({
      message: "Carregando contas...",
      backdropDismiss: false
    })
    await loading.present()
    await this.setupWebAuth()
    const userId = await this.authService.getCurrentUserId()
    if(userId) {
      this.accountsService.loadAccounts(userId)
      this.accounts$ = this.accountsService.getAccounts()
      const lastSelectedAccountId: string | undefined = await this.storageService.get('lastSelectedAccountId')
      if(lastSelectedAccountId) {
        const accounts = await firstValueFrom(this.accounts$)
        const lastSelectedAccount = accounts.find(account => account.id === lastSelectedAccountId)
        if(lastSelectedAccount) {
          this.selectAccount(lastSelectedAccount)
        }
      }
    }
    await loading.dismiss()
  }

  async logout() {
    this.hidePopover()
    const loading = await this.loadingController.create({
      message: "Logout...",
      spinner: "circular",
      backdropDismiss: false
    })
    await loading.present()
    await this.accountsService.clearCache()
    await this.authService.logout()
    //reload window
    await loading.dismiss()
    window.location.reload()
  }

  selectAccount(account: any) {
    this.selectedAccount = account
    if(account && account.id) {
      this.storageService.set('lastSelectedAccountId', account.id)
    }
  }

  handleSearch(evt: any) {
    const searchTerm = evt?.detail?.value
    console.log({evt, searchTerm})
    this.searchTxt = searchTerm
  }

  async handleSearchLogo(evt: any) {
    const searchTerm = evt?.detail?.value
    console.log({evt, searchTerm})
    if(!searchTerm) {
      this.draftLogoURL = ''
      this.searchLogoResults = []
      return
    }
    const brandInfo = await this.logoService.searchServiceInfo(searchTerm)
    if(brandInfo && brandInfo.length > 0) {
      this.draftLogoURL = brandInfo[0].logo
      this.searchLogoResults = brandInfo.map(brand => brand.logo)
    }
    console.log({brandInfo, draftLogoURL: this.draftLogoURL, searchTerm: this.draftLogoSearchTxt, results: this.searchLogoResults})
  }

  selectLogo(logoURL: string) {
    this.draftLogoURL = logoURL
  }

  async addAccountAction() {
    this.hidePopover()
    this.isAddAccountModalOpen = true
    this.scanCode()
  }

  showPopover(e: Event) {
    this.popover.event = null
    this.popover.event = e;
    this.hidePopover()
    setTimeout(() => {
      this.isPopoverOpen = true;
    }, 50);
  }

  onDidDismissModal(e: Event) {
    this.isAddAccountModalOpen = false
    this.manualInput = false
    this.isAddAccountModalOpen = false
    this.isScanActive = false
    if(this.qrscanner) {
      this.qrscanner.stop()
    }
    // clear form
    this.validations_form.reset()
    this.draftLogoURL = ''
    this.draftLogoSearchTxt = ''
    this.searchLogoResults = []
  }

  onWillDismissModal(e: Event) {
    if(this.qrscanner) {
      this.qrscanner.stop()
    }
  }

  async closeAddAccountModal() {
    await this.modal.dismiss()
  }

  async createAccount(formValues: any) {
    console.log({formValues})
    const logo = this.draftLogoURL
    await this.closeAddAccountModal()
    const newAccountDict = Object.assign(formValues, {logo, active: true })
    const account = Account2FA.fromDictionary(newAccountDict)
    console.log({account2fa: account})
    const loading = await this.loadingController.create({
      message: "Adicionando conta...",
      backdropDismiss: false
    })
    await loading.present()
    try {
      
      let userId = await this.authService.getCurrentUserId() as string
      if(!userId) {
        throw new Error('User not found')
      }
      
      await this.accountsService.addAccount(userId, account)
      await loading.dismiss()
      // select new account
      this.selectAccount(account)
    } catch (error: any) {
      await loading.dismiss()
      const toast = await this.toastController.create({
        message: "Erro ao adicionar conta: " + error && error.message || "Erro desconhecido",
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
      if(this.currentDarkModePref !== 'system') {
        return
      }
      this.useDarkPalette(mediaQuery.matches)
    });
    const darkPalettePref = await this.storageService.get<string|undefined>('darkPalette')
    console.log({darkPalettePref})
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
    const loading = await this.loadingController.create({
      message: "Carregando camera...",
      backdropDismiss: false
    })
    await loading.present()
    await firstValueFrom(this.qrscanner.start())
    const devices = (await firstValueFrom(this.qrscanner.devices)).filter(device => device.kind === 'videoinput')
    console.log({devices})
    // find back camera
    let backCamera = devices.find(device => device.label.toLowerCase().includes('back camera'))
    if(!backCamera) {
      backCamera = devices.find(device => device.label.toLowerCase().match(/.*back.*camera.*/))
    }

    if(backCamera && backCamera.deviceId) {
      console.log("using device", {backCamera})
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
    console.log({current})
    const devices = await firstValueFrom(this.qrscanner.devices)
    console.log({devices})
    const next = (current + 1) % devices.length
    const nextDevice = devices[next]
    this.qrscanner.playDevice(nextDevice.deviceId)
  }

  private processQRCode(evt: string) {
    // The URI format and params is described in https://github.com/google/google-authenticator/wiki/Key-Uri-Format
    // otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30
    try {
      const account = Account2FA.fromOTPAuthURL(evt)
      console.log({account})
  
      this.validations_form.controls['label'].setValue(account.label)
      this.validations_form.controls['secret'].setValue(account.secret)
      this.validations_form.controls['tokenLength'].setValue(account.tokenLength)
      this.validations_form.controls['interval'].setValue(account.interval)
      // service name inferred from issuer or label
      const serviceName = account.issuer || account.label.split(':')[0]
      const event = {detail: {value: serviceName}}
      this.handleSearchLogo(event)
    } catch (error) {
      console.error("Error processing QR code", error)
      this.toastController.create({
        message: "Código QR inválido",
        duration: 2000,
        color: 'danger'
      }).then(toast => toast.present())
    }
    this.manualInput = true
  }

  private hidePopover() {
    this.isPopoverOpen = false;
  }

  private async setupWebAuth() {
    const webAuthState = await this.storageService.get<boolean>('webAuthEnabled')
    if(webAuthState) {
      this.supportsWebCredentialManagement = true
      return
    }
  }
}
