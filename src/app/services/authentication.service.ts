import { inject, Injectable } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { NavController } from '@ionic/angular';
import { LocalStorageService } from './local-storage.service';
import { AppConfigService } from './app-config.service';

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {
  private afAuth: Auth = inject(Auth)
  constructor(private navCtrl: NavController, private localStorage: LocalStorageService, private appConfig: AppConfigService) { }

  async canActivate(): Promise<boolean> {
    if(await this.appConfig.isOfflineMode()) {
      return true
    }
    
    await this.afAuth.authStateReady()
    
    if (this.afAuth.currentUser) {
      return true
    }

    this.navCtrl.navigateRoot('/login', { skipLocationChange: true });
    return false
  }

  public async loginUser(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.afAuth, email, password)   
  }

  public async logout() {
    await signOut(this.afAuth)
    await this.localStorage.clearStorage()
    console.log("logged out")
  }

  public async getCurrentUserId() {
    await this.afAuth.authStateReady()
    return this.afAuth.currentUser?.uid
  }
}
