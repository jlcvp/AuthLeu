import { Injectable } from '@angular/core';
import { LocalStorageService } from './local-storage.service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {

  constructor(private localStorage: LocalStorageService) { }

  async isOfflineMode() {
    const isOfflinePref = await this.localStorage.get<boolean>('isOfflineMode') ?? false;
    // if isOfflinePref is not set, use the environment variable
    return isOfflinePref ?? environment.isOfflineEnv;
  }

  async setOfflineMode(isOffline: boolean) {
    await this.localStorage.set('isOfflineMode', isOffline);
  }

  isOfflineEnv() {
    return environment.isOfflineEnv;
  }

  static supportsCryptoAPI(): boolean {
    return !!(crypto && crypto.subtle)
  }
}
