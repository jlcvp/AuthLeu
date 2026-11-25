import { Component, HostListener, Input } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Account2FA } from 'src/app/models/account2FA.model';
import { OtpService } from 'src/app/services/otp.service';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-account-detail',
    templateUrl: './account-detail.component.html',
    styleUrls: ['./account-detail.component.scss'],
    standalone: false
})
export class AccountDetailComponent {
  /** When the current code changes, in milliseconds since the epoch */
  codeEndTime = 0

  private _account?: Account2FA
  private _token = '000 000'
  private hasCode = false
  @Input() set account(value: Account2FA | undefined) {
    this._account = value
    this.updateCodeEndTime()
    this.updateCode()
  }

  // timers are throttled while the app is in the background, so resync when it's back
  @HostListener('window:focus')
  @HostListener('document:visibilitychange')
  onResume(): void {
    this.updateCode()
    this.updateCodeEndTime()
  }

  @HostListener('copy', ['$event'])
  onCopy(event: Event): void {
    console.log('copy event captured', { event })
    this.copyCode(undefined)
    event?.preventDefault()
  }
  get account(): Account2FA | undefined {
    return this._account
  }

  constructor(private otpService: OtpService, private toastController: ToastController, private translateService: TranslateService) { }

  set token(value: string) {
    if(value.length <= 4) { // if token length is 4 or less, use it as is
      this._token = value
    } else if(value.length % 7 == 0) { // if token has a length divisible by 7, separate in groups of (2,3,2) characters
      this._token = value.replace(/(.{2})(.{3})(.{2})/g, '$1 $2 $3 ').trim()
    } else if(value.length % 5 == 0) { // if token has a length divisible by 5, separate in groups of (2,3) characters
      this._token = value.replace(/(.{2})(.{3})/g, '$1 $2 ').trim()
    } else if(value.length % 3 == 0) { // if token has a length divisible by 3, add a space every 3 characters
      this._token = value.replace(/(.{3})/g, '$1 ').trim()
    } else if(value.length % 2 == 0) { // if token has a length divisible by 2, add a space every 2 characters
      this._token = value.replace(/(.{2})/g, '$1 ').trim()
    } else { // if token has an odd length, add space every 3 characters, starting from the end
      const reversedChars = value.split('').reverse()
      let token = ''
      reversedChars.forEach((char, index) => {
        if(index % 3 == 0) {
          token += ' '
        }
        token += char
      })
      this._token = token.trim().split('').reverse().join('')
    }
    console.log("new Token = ", this._token)
  }

  get token(): string {
    return this._token
  }

  async copyCode(evt: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if(!this.account || !this.hasCode) {
      return
    }
    console.log("copying code", {evt})
    const code = this.token.replace(/\s/g, '')
    await navigator.clipboard.writeText(code)
    console.log("code copied")
    const message = await firstValueFrom(this.translateService.get('ACCOUNT_DETAIL.CODE_COPIED'))
    const toast = await this.toastController.create({
      message,
      positionAnchor: evt?.target,
      position: evt ? undefined : 'middle',
      mode: 'md',
      cssClass: 'width-auto',
      duration: 2000
    })
    await toast.present()
  }

  timerEnd() {
    console.log("timer end")
    this.updateCodeEndTime()
    this.updateCode()
  }

  updateCode() {
    if(this.account) {
      console.log("generating new code")
      const code = this.generateCode(this.account)
      this.hasCode = !!code
      // never show a code that may be wrong
      this.token = code || '-'.repeat(this.account.tokenLength)
    }
  }

  /**
   * Generates the current code of an account.
   * @returns The code, or undefined if a correct code can't be generated.
   */
  private generateCode(account: Account2FA): string | undefined {
    if(account.isLocked) {
      return undefined // the secret is still encrypted
    }
    try {
      return this.otpService.generateTOTP(account)
    } catch (error) {
      // e.g. an imported account with an unsupported algorithm
      console.error("Error generating code", error)
      return undefined
    }
  }

  private updateCodeEndTime() {
    // the code changes when the time step (Unix time divided by the period) changes
    const period = (this.account?.interval || 30) * 1000
    const now = Date.now()
    this.codeEndTime = now - (now % period) + period
  }
}
