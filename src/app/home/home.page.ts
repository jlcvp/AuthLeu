import { Component } from '@angular/core';
import { AuthenticationService } from '../services/authentication.service';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {

  constructor(private authService: AuthenticationService, private navCtrl: NavController) {}

  async logout() {
    await this.authService.logout()
    this.navCtrl.navigateRoot('/login', { skipLocationChange:  true })
  }
}
