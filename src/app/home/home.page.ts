import { Component, OnInit, ViewChild } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { IonModal, LoadingController, NavController, ToastController, ToastOptions } from '@ionic/angular';
import { firstValueFrom, Observable } from 'rxjs';
import { Account2FA } from '../models/account2FA.model';
import { Account2faService } from '../services/account2fa.service';
import { OtpService } from '../services/otp.service';
import { LogoService } from '../services/logo.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgxScannerQrcodeComponent, ScannerQRCodeResult } from 'ngx-scanner-qrcode';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {
  @ViewChild('popover') popover: any;
  @ViewChild(IonModal) modal!: IonModal;
  @ViewChild('qrscanner') qrscanner!: NgxScannerQrcodeComponent;
  accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  selectedAccount: Account2FA | null = null
  refreshTimeout: any
  timerRefreshInterval: any
  timer: number = 0
  searchTxt: string = ''
  manualInput: boolean = false
  isPopoverOpen: boolean = false
  isAddAccountModalOpen: boolean = false
  isScanActive: boolean = false
  validations_form: FormGroup;

  constructor(
    private authService: AuthenticationService, 
    private navCtrl: NavController,
    private accountsService: Account2faService,
    private otpService: OtpService,
    private logoService: LogoService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    formBuilder: FormBuilder
  ) {
    this.validations_form = formBuilder.group({
      accountName: new FormControl('', Validators.compose([
        Validators.required,
      ])),
      secret: new FormControl('', Validators.compose([
        Validators.required,
        Validators.minLength(8),
        Validators.pattern('^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$')
      ])),
      serviceName: new FormControl('', Validators.compose([
        Validators.required,
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
  
  async ngOnInit() {
    const loading = await this.loadingController.create({
      message: "Carregando contas...",
      backdropDismiss: false
    })
    await loading.present()
    const userId = await this.authService.getCurrentUserId()
    if(userId) {
      this.accountsService.loadAccounts(userId)
      this.accounts$ = this.accountsService.getAccounts()
    }
    await loading.dismiss()
  }

  async logout() {
    await this.authService.logout()
    this.navCtrl.navigateRoot('/login', { skipLocationChange:  true })
  }

  selectAccount(account: any) {
    this.selectedAccount = account
    console.log("generating new code")
    this.updateTimer()
    if(this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
    }
    
    this.refreshTimeout = setTimeout(() => {
      clearTimeout(this.refreshTimeout)
      this.selectAccount(account)
    }, account.getNextRollingTimeLeft() * 1000)
  }

  updateTimer() {
    if(this.timerRefreshInterval) {
      clearInterval(this.timerRefreshInterval)
    }
    if(this.selectedAccount) {
      this.timer = this.selectedAccount.getNextRollingTimeLeft()
      this.timerRefreshInterval = setInterval(() => {
        this.timer = this.selectedAccount?.getNextRollingTimeLeft() || -10
      }, 1000)
    }
  }

  async copyCode(evt: any) {
    if(!this.selectedAccount) {
      return
    }
    const code = this.selectedAccountCode
    await navigator.clipboard.writeText(code)
    const toast = await this.toastController.create({
      message: `Código copiado`,
      positionAnchor: evt.target,
      cssClass: 'width-auto',
      duration: 2000
    })
    console.log({evt})
    await toast.present()
  }

  get selectedAccountCode() {
    if(!this.selectedAccount) {
      return ''
    }
    return this.otpService.generateTOTP(this.selectedAccount.secret, this.selectedAccount.interval || 30)
  }

  handleSearch(evt: any) {
    const searchTerm = evt?.detail?.value
    console.log({evt, searchTerm})
    this.searchTxt = searchTerm
  }

  async addAccountAction() {
    this.hidePopover()
    this.isAddAccountModalOpen = true

    // let userId = await this.authService.getCurrentUserId()
    // if(!userId) {
    //   return
    // }

    // userId = userId as string
    // const account = new Account2FA('', 'Google', 'My Account', 'JBSWY3D', 6, 30, true, 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png')
    // const loading = await this.loadingController.create({
    //   message: "Adicionando conta...",
    //   backdropDismiss: false
    // })
    // await loading.present()
    // await this.accountsService.addAccount(userId, account)
    // await loading.dismiss()
  }

  showPopover(e: Event) {
    this.popover.event = null
    this.popover.event = e;
    this.hidePopover()
    setTimeout(() => {
      this.isPopoverOpen = true;
    }, 50);
  }

  onWillDismissModal(e: Event) {
    console.log("Closing modal MODAL", {e})
    this.isAddAccountModalOpen = false
  }

  async cancelAddAccount() {
    await this.modal.dismiss()
  }

  createAccount(formValues: any) {

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
    await loading.dismiss()
  }

  waitQRScannerInit() {
    return new Promise<void>((resolve, reject) => {
      let tries = 0
      const maxTries = 20
      const interval = setInterval(() => {
        if(!this.qrscanner.isLoading) {
          clearInterval(interval)
          resolve()
        }
        if(tries >= maxTries) {
          clearInterval(interval)
          reject()
        }
        tries++
      }, 500)
    })
  }

  onQRCodeScanned(evt: ScannerQRCodeResult[], qrscanner: NgxScannerQrcodeComponent) {
    qrscanner.stop()
    this.isScanActive = false
    
    this.processQRCode(evt && evt[0]?.value || '')
  }

  private processQRCode(evt: string) {
    // otpauth://totp/Google:My%20Account?secret=JBSWY3D&issuer=Google&algorithm=SHA1&digits=6&period=30
    const account = Account2FA.fromOTPAuthURL(evt)
    console.log({account})

    this.validations_form.controls['accountName'].setValue(account.accountName)
    this.validations_form.controls['secret'].setValue(account.secret)
    this.validations_form.controls['serviceName'].setValue(account.serviceName)
    this.validations_form.controls['tokenLength'].setValue(account.tokenLength)
    this.validations_form.controls['interval'].setValue(account.interval)


    this.manualInput = true
  }

  private hidePopover() {
    this.isPopoverOpen = false;
  }
}
