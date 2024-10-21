// login.page.ts
import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { LoadingController, NavController, ToastController } from '@ionic/angular';
import { AuthenticationService } from '../services/authentication.service';
import { AppConfigService } from '../services/app-config.service';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { GlobalUtils } from '../utils/global-utils';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  animations: [
    trigger('openClose', [
      state('true', style({height: '*'})),
      state('false', style({height: '0px'})),
      transition('false <=> true', animate(300)),
    ])
  ]
})
export class LoginPage implements OnInit {
  loginFormVisible = false;
  validations_form: FormGroup;
  constructor(
    private loadingController: LoadingController,
    private navCtrl: NavController,
    private authService: AuthenticationService,
    private toastController: ToastController,
    private appConfig: AppConfigService,
    private translateService: TranslateService,
    formBuilder: FormBuilder
  ) {
    
    this.validations_form = formBuilder.group({
      email: new FormControl('', Validators.compose([
        Validators.required,
        Validators.pattern('^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$')
      ])),
      password: new FormControl('', Validators.compose([
        Validators.required
      ])),
    });
  }


  validation_messages = {
    'email': [
      { type: 'required', message: 'LOGIN.VALIDATION_MSGS.REQUIRED_EMAIL' },
      { type: 'pattern', message: 'LOGIN.VALIDATION_MSGS.EMAIL_PATTERN' }
    ],
    'password': [
      { type: 'required', message: 'LOGIN.VALIDATION_MSGS.REQUIRED_PASSWORD' }
    ]
  };

  async ngOnInit() {
    const offlineMode = await this.appConfig.isOfflineEnv()
    this.loginFormVisible = !offlineMode
    console.log("Offline mode: ", offlineMode)
    GlobalUtils.hideSplashScreen()
  }

  showLoginForm() {
    this.loginFormVisible = true;
  }

  async loginUser(value: { email: string, password: string }) {
    const message = await firstValueFrom(this.translateService.get('LOGIN.AUTHENTICATING'))
    const loading = await this.loadingController.create({
      message,
      backdropDismiss: false
    })

    await loading.present()
    let errorMessage = ""
    try {
      await this.authService.loginUser(value.email, value.password)
      await this.appConfig.setOfflineMode(false)
      await loading.dismiss()
      this.navCtrl.navigateForward('/home', {skipLocationChange: true})
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      switch(error.code) {
        case 'auth/user-not-found':
          errorMessage = "LOGIN.ERROR_MSGS.USER_NOT_FOUND"
        break
        case 'auth/wrong-password':
          errorMessage = "LOGIN.ERROR_MSGS.INVALID_PASSWORD"
        break
        case 'auth/too-many-requests':
          errorMessage = "LOGIN.ERROR_MSGS.TOO_MANY_ATTEMPTS_TRY_LATER"
        break
        default:
          errorMessage = "LOGIN.ERROR_MSGS.DEFAULT_ERROR"
      }
      const translatedMessage = await firstValueFrom(this.translateService.get(errorMessage))
      await loading.dismiss()
      console.error(`Error logging in: ${translatedMessage}`, {error, errorMessage})
      await this.presentToast(translatedMessage)
    }
  }

  private async presentToast(message: string, duration: number = 1500) {
    const toast = await this.toastController.create({
      message,
      color: "danger",
      duration,
      position: "middle"
    })
    await toast.present();
  }

  continueOffline() {
    this.appConfig.setOfflineMode(true)
    this.navCtrl.navigateForward('/home', {skipLocationChange: true})
  }

}
