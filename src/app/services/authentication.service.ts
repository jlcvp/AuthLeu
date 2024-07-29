import { inject, Injectable } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { NavController } from '@ionic/angular';
import { LocalStorageService } from './local-storage.service';
import { sha1 } from 'js-sha1';
import { environment } from 'src/environments/environment';
@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {
  private afAuth: Auth = inject(Auth)
  constructor(private navCtrl: NavController, private localStorage: LocalStorageService) { }

  async canActivate(): Promise<boolean> {
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

  public async hashPassword(password: string): Promise<string> {
    const userId = await this.getCurrentUserId() ?? 'user';
    const hmac = sha1.hmac.create(userId);
    hmac.update(password);
    return hmac.hex();
  }

  public async supportsWebCredentialManagement(): Promise<boolean> {
    const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return isAvailable;
  }

  public async getWebCredential(credentialId: string): Promise<Credential | null> {
    const credentialIdBuffer = new TextEncoder().encode(credentialId);
    const challengeBuffer = this.challengeBuffer
    const options: CredentialRequestOptions = {
      publicKey: {
          challenge: challengeBuffer,
          rpId: environment.webAuthConfig.rpId,
          allowCredentials: [{
               type: "public-key",
               id: credentialIdBuffer,
               transports: ["internal"]
          }],
          
      }
    };

    const publicKeyCredential = await navigator.credentials.get(options);
    console.log("publicKeyCredential", {publicKeyCredential})
    return publicKeyCredential
  }

  public async createWebCredential(): Promise<Credential | null> {
    const userId = await this.getCurrentUserId() ?? 'user';
    const userIdBuffer = new TextEncoder().encode(userId);
    const userMail = await this.afAuth.currentUser?.email ?? userId
    const userDisplayName = await this.afAuth.currentUser?.displayName ?? "User"
    const challengeBuffer = this.challengeBuffer
    const options: CredentialCreationOptions = {
      publicKey: {
          rp: { name: environment.webAuthConfig.rpId },
          user: {
              name: userMail,
              id: userIdBuffer,
              displayName: userDisplayName
          },
          pubKeyCredParams: [ { type: "public-key", alg: -7 } ],
          challenge: challengeBuffer,
          authenticatorSelection: { authenticatorAttachment: "platform" } // Required for faceID
      }
    };
    const publicKeyCredential = await navigator.credentials.create(options);
    console.log("publicKeyCredential created", {publicKeyCredential})
    return publicKeyCredential
  }

  private get challengeBuffer(): Uint8Array {
    // random challenge 32 bytes
    const challengeBuffer = (new Uint8Array(32)).map(() => Math.floor(Math.random() * 255)); // sudo
    if(window.crypto) {
      window.crypto.getRandomValues(challengeBuffer); // better random
    }
    return challengeBuffer
  }
}
