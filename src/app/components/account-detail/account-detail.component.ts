import { Component, Input } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Account2FA } from 'src/app/models/account2FA.model';
import { OtpService } from 'src/app/services/otp.service';

@Component({
  selector: 'app-account-detail',
  templateUrl: './account-detail.component.html',
  styleUrls: ['./account-detail.component.scss'],
})
export class AccountDetailComponent {

  private timerRefreshInterval: any
  private _account?: Account2FA
  timer: number = 0 
  private _token = '000 000'

  @Input() set account(value: Account2FA | undefined) {
    this._account = value
    this.updateCode()
    this.updateTimer()
  }
  get account(): Account2FA | undefined {
    return this._account
  }

  constructor(private otpService: OtpService, private toastController: ToastController) { }

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
  }

  get token(): string {
    return this._token
  }

  async copyCode(evt: any) {
    if(!this.account) {
      return
    }
    const code = this.token.replace(/\s/g, '')
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

  updateTimer() {
    if(this.timerRefreshInterval) {
      clearInterval(this.timerRefreshInterval)
    }
    if(this.account) {
      this.timer = this.account.getNextRollingTimeLeft()
      this.timerRefreshInterval = setInterval(() => {
        if(!this.account) {
          clearInterval(this.timerRefreshInterval)
          this.timer = NaN
        } else {
          this.timer = this.account.getNextRollingTimeLeft()
          if (this.timer == this.account.interval) { // new code needed
            this.updateCode()
          }
        }
      }, 500) // for precision purposes update every 500ms
    }
  }

  updateCode() {
    if(this.account) {
      console.log("generating new code")
      this.token = this.otpService.generateTOTP(this.account.secret, this.account.interval)
    }
  }
}
