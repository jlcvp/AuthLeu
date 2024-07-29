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
  token = '000000'

  @Input() set account(value: Account2FA | undefined) {
    this._account = value
    this.updateCode()
    this.updateTimer()
  }
  get account(): Account2FA | undefined {
    return this._account
  }

  constructor(private otpService: OtpService, private toastController: ToastController) { }

  async copyCode(evt: any) {
    if(!this.account) {
      return
    }
    const code = this.token
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
