import { Component, OnInit } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { LoadingController, NavController, ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { Account2FA } from '../models/account2FA.model';
import { Account2faService } from '../services/account2fa.service';
import { OtpService } from '../services/otp.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {
  accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  selectedAccount: Account2FA | null = null
  refreshTimeout: any
  timerRefreshInterval: any
  timer: number = 0

  constructor(
    private authService: AuthenticationService, 
    private navCtrl: NavController,
    private accountsService: Account2faService,
    private otpService: OtpService,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}
  
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

  async addAccount() {
    let userId = await this.authService.getCurrentUserId()
    if(!userId) {
      return
    }

    userId = userId as string
    const account = new Account2FA('', 'Google', 'My Account', 'JBSWY3D', 6, 30, true, 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png')
    const loading = await this.loadingController.create({
      message: "Adicionando conta...",
      backdropDismiss: false
    })
    await loading.present()
    await this.accountsService.addAccount(userId, account)
    await loading.dismiss()
  }
}
