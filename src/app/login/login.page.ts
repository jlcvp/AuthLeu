// login.page.ts
import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { LoadingController, NavController, ToastController } from '@ionic/angular';
import { AuthenticationService } from '../services/authentication.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {

  validations_form: FormGroup;
  errorMessage: string = '';

  constructor(
    private loadingController: LoadingController,
    private navCtrl: NavController,
    private authService: AuthenticationService,
    private toastController: ToastController,
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
      { type: 'required', message: 'Obrigatório informar um e-mail.' },
      { type: 'pattern', message: 'Informe um e-mail.' }
    ],
    'password': [
      { type: 'required', message: 'Informe a senha.' }
    ]
  };


  async loginUser(value: { email: string, password: string }) {
    const loading = await this.loadingController.create({
      message: "Autenticando...",
      backdropDismiss: false
    })

    await loading.present()
    try {
      await this.authService.loginUser(value.email, value.password)
      this.errorMessage = ""
      await loading.dismiss()
      this.navCtrl.navigateForward('/home', {skipLocationChange: true})
    } catch (error: any) {
      switch(error.code) {
        case 'auth/user-not-found':
          this.errorMessage = "Usuário não existe"
        break
        case 'auth/wrong-password':
          this.errorMessage = "Senha incorreta"
        break
        case 'auth/too-many-requests':
          this.errorMessage = "Muitas tentativas de login, a conta está bloqueada por 5 minutos."
        break
        default:
          this.errorMessage = "Não foi possível fazer o login, verifique as credenciais e tente novamente"
      }
      await loading.dismiss()
      console.error(`Error logging in: ${this.errorMessage}`, {error})
      await this.presentToast(this.errorMessage)
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

}
