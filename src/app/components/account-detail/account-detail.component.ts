import { Component, Input, ViewChild } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Account2FA } from 'src/app/models/account2FA.model';
import { OtpService } from 'src/app/services/otp.service';
import { CountdownTimerComponent } from '../countdown-timer/countdown-timer.component';
import { debounceTime, pipe } from 'rxjs';

@Component({
  selector: 'app-account-detail',
  templateUrl: './account-detail.component.html',
  styleUrls: ['./account-detail.component.scss'],
})
export class AccountDetailComponent {
  @ViewChild(CountdownTimerComponent) countdownTimer!: CountdownTimerComponent;

  private _account?: Account2FA
  private _token = '000 000'
  private _tokenCountdown = 30
  private debounceTimeout: any
  @Input() set account(value: Account2FA | undefined) {
    this._account = value
    this.updateTokenCountdown()
    this.updateCode()
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

  private set tokenCountdown(value: number) {
    this._tokenCountdown = value
    setTimeout(() => {
      this.countdownTimer?.startTimer()
    }, 50);
  }

  get tokenCountdown(): number {
    return this._tokenCountdown
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

  timerEnd() {
    setTimeout(() => {
      this.updateCode()
      this.updateTokenCountdown()
    }, 1000);
  }

  updateCode() {
    if(this.account) {
      console.log("generating new code")
      this.token = this.otpService.generateTOTP(this.account.secret, this.account.interval)
    }
  }

  private updateTokenCountdown() {
    if(!this.debounceTimeout) {
      this.debounceTimeout = setTimeout(() => {
        this.tokenCountdown = this.account?.getNextRollingTimeLeft() || this.account?.interval || 30
        this.debounceTimeout = undefined
      }, 150)
    }
  }
}
