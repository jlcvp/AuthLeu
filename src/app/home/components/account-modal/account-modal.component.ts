import { Component, OnInit, ViewChild } from '@angular/core';
import { FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { AlertController, LoadingController, ModalController, SearchbarCustomEvent, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';
import { firstValueFrom } from 'rxjs';
import { Account2FA } from 'src/app/models/account2FA.model';
import { LogoService } from 'src/app/services/logo.service';

@Component({
  selector: 'app-account-modal',
  templateUrl: './account-modal.component.html',
  styleUrls: ['./account-modal.component.scss'],
})
export class AccountModalComponent implements OnInit {
  @ViewChild('qrscanner') qrscanner!: NgxScannerQrcodeComponent;

  isScanActive = false;
  isCameraSettled = false;
  draftLogoURL = '';
  draftLogoSearchTxt = '';
  searchLogoResults: string[] = [];

  qrScannerOpts: ScannerQRCodeConfig = {
    isBeep: false,
    vibrate: 100,
    constraints: {
      video: {
        facingMode: 'environment'
      }
    }
  }
  validations_form: FormGroup;

  private loading: HTMLIonLoadingElement | undefined = undefined

  constructor(
    formBuilder: FormBuilder, 
    private translateService: TranslateService, 
    private logoService: LogoService, 
    private toastController: ToastController, 
    private loadingController: LoadingController,
    private alertController: AlertController,
    private modalController: ModalController
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

  ngOnInit(): void {
    this.scanCode()
  }

  async onWillDismiss() {
    if (this.qrscanner) { 
      console.log("STOP QR")
      await this.stopScanner()
    }
  }

  async dismiss(data: Account2FA | null = null) {
    // Dismiss the modal
    const role = data ? 'added' : 'cancel'
    await this.onWillDismiss()
    await this.modalController.dismiss(data, role)
  }

  async onQRCodeScanned(evt: ScannerQRCodeResult[], qrscanner: NgxScannerQrcodeComponent) {
    try {
      console.log('qr code scanned', { evt, qrscanner })
      await this.stopScanner()
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
    this.isCameraSettled = false
    const current = this.qrscanner.deviceIndexActive
    const devices = await firstValueFrom(this.qrscanner.devices)
    const next = (current + 1) % devices.length
    const nextDevice = devices[next]
    console.log(`cycle device [${current}] -> [${next}]`, { playDevice: nextDevice, devices })
    await this.qrscanner.playDevice(nextDevice.deviceId)
    await this.showInfoToast(`${nextDevice.label}`, 'top')
    await this.awaitCameraSettle()
    this.isCameraSettled = true
  }

  async manualInputAction() {
    if (this.qrscanner) {
      console.log("STOP QR Reading")
      await this.stopScanner()
    }
    this.isScanActive = false;
  }

  async scanCode() {
    // <ngx-scanner-qrcode #action="scanner" (event)="onEvent($event, action)"></ngx-scanner-qrcode>
    this.isScanActive = true
    const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.LOADING_CAMERA'))
    await this.presentLoading(message)
    try {
      await firstValueFrom(this.qrscanner.start())
      console.log('QR scanner started')
      await this.awaitCameraSettle()
    } catch (error) {
      // camera permission denial
      const header = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.ERROR_CAMERA_HEADER'))
      const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.ERROR_CAMERA_MESSAGE'))
      await this.dismissLoading()
      await this.showAlert(message, header)
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
      await this.awaitCameraSettle()
    }
    this.isCameraSettled = true
    await this.dismissLoading()
  }

  async handleSearchLogo(evt: SearchbarCustomEvent) {
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

  async createAccount(formValues: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log({ formValues })
    const logo = this.draftLogoURL
    const newAccountDict = Object.assign(formValues, { logo, active: true })
    try {
    const account = Account2FA.fromDictionary(newAccountDict)
    console.log({ account2fa: account })
    this.dismiss(account)
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.INVALID_FIELDS'))
      console.error("Error adding account", error)
      await this.showErrorToast(message)
    }
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
      const event = new CustomEvent('search', { detail: { value: serviceName } }) as SearchbarCustomEvent
      this.handleSearchLogo(event)
    } catch (error) {
      const message = await firstValueFrom(this.translateService.get('ADD_ACCOUNT_MODAL.ERROR_MSGS.INVALID_QR_CODE'))
      console.error("Error processing QR code", error)
      await this.showErrorToast(message)
    }
  }

  private async showInfoToast(message: string, position: "top" | "bottom" | "middle" | undefined = undefined) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: position
    })
    await toast.present()
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color: 'danger',
      position: 'middle'
    })
    await toast.present()
  }

  private async presentLoading(message: string): Promise<void> {
    // if loading is already present, update message
    if(this.loading != undefined) {
      this.loading.message = message
      return
    }

    // create new loading
    this.loading = await this.loadingController.create({
      message,
      backdropDismiss: false
    })
    await this.loading.present()
  }

  private async dismissLoading(): Promise<void> {
    await this.loading?.dismiss()
    this.loading = undefined
  }

  private async showAlert(message: string, header: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    })
    await alert.present()
  }

  private async stopScanner() {
    if(this.qrscanner) {
      await this.awaitCameraSettle()
      await firstValueFrom(this.qrscanner.stop())
    }
  }

  private async awaitCameraSettle(timeoutMillis: number = 10000) {
    return new Promise<void>((resolve, reject) => {
      console.log("Waiting for camera to settle")
      if(!this.qrscanner) {
        reject("No scanner")
        return
      }
      let timeout: any = undefined // eslint-disable-line @typescript-eslint/no-explicit-any
      // while not settled, keep checking every 100ms
      const interval = setInterval(() => {
        if(this.qrscanner.isStart) {
          clearInterval(interval)
          if(timeout) {
            clearTimeout(timeout)
          }
          console.log("Camera settled")
          resolve()
        }
      }, 100)

      // if timeout, reject
      timeout = setTimeout(() => {
        clearInterval(interval)
        reject("Timeout")
      }, timeoutMillis)
      
    })
  }
}
