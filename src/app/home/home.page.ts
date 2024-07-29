import { Component, OnInit } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { LoadingController, NavController } from '@ionic/angular';
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
  constructor(
    private authService: AuthenticationService, 
    private navCtrl: NavController,
    private accountsService: Account2faService,
    private otpService: OtpService,
    private loadingController: LoadingController
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
    console.log({account})
    this.selectedAccount = account
  }

  get selectedAccountCode() {
    if(!this.selectedAccount) {
      return ''
    }
    return this.otpService.generateTOTP(this.selectedAccount.secret, this.selectedAccount.interval || 30)
  }
}
