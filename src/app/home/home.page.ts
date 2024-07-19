import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { IonModal, LoadingController, NavController, ToastController, ToastOptions } from '@ionic/angular';
import { debounceTime, firstValueFrom, fromEvent, lastValueFrom, Observable } from 'rxjs';
import { Account2FA } from '../models/account2FA.model';
import { Account2faService } from '../services/account2fa.service';
import { OtpService } from '../services/otp.service';
import { LogoService } from '../services/logo.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';
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

  qrScannerOpts: ScannerQRCodeConfig = {
    isBeep: false,
    vibrate: 100
  }

  isLandscape: boolean = false
  accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  selectedAccount?: Account2FA
  searchTxt: string = ''
  manualInput: boolean = false
  isPopoverOpen: boolean = false
  isAddAccountModalOpen: boolean = false
  isScanActive: boolean = false
  validations_form: FormGroup;

  constructor(
    private authService: AuthenticationService, 
    private accountsService: Account2faService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    formBuilder: FormBuilder
  ) {
    this.validations_form = formBuilder.group({
      label: new FormControl('', Validators.compose([
        Validators.required,
      ])),
      secret: new FormControl('', Validators.compose([
        Validators.required,
        Validators.minLength(8),
        Validators.pattern('^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$')
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
  
  async ngOnInit() {
    this.onWindowResize()
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
  }

  handleSearch(evt: any) {
    const searchTerm = evt?.detail?.value
    console.log({evt, searchTerm})
    this.searchTxt = searchTerm
  }

  async addAccountAction() {
    this.hidePopover()
    this.isAddAccountModalOpen = true
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
    this.isAddAccountModalOpen = false
    this.manualInput = false
    this.isAddAccountModalOpen = false
    this.isScanActive = false
    // clear form
    this.validations_form.reset()
  }

  async closeAddAccountModal() {
    await this.modal.dismiss()
  }

  async createAccount(formValues: any) {
    
    console.log({formValues})
    await this.closeAddAccountModal()
    // TODO: get logo
    const account = Account2FA.fromDictionary(formValues)
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

  onQRCodeScanned(evt: ScannerQRCodeResult[], qrscanner: NgxScannerQrcodeComponent) {
    qrscanner.stop()
    this.isScanActive = false
    
    this.processQRCode(evt && evt[0]?.value || '')
  }

  private processQRCode(evt: string) {
    // otpauth://totp/Google:My%20Account?secret=JBSWY3D&issuer=Google&algorithm=SHA1&digits=6&period=30
    const account = Account2FA.fromOTPAuthURL(evt)
    console.log({account})

    this.validations_form.controls['label'].setValue(account.label)
    this.validations_form.controls['secret'].setValue(account.secret)
    this.validations_form.controls['tokenLength'].setValue(account.tokenLength)
    this.validations_form.controls['interval'].setValue(account.interval)

    this.manualInput = true
  }

  private hidePopover() {
    this.isPopoverOpen = false;
  }
}
