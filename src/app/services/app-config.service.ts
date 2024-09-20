import { Injectable } from '@angular/core';
import { LocalStorageService } from './local-storage.service';
import { environment } from 'src/environments/environment';
import { ENCRYPTION_OPTIONS_KEY, EncryptionOptions } from '../models/encryption-options.model';

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

  async getEncryptionOptions() {
    return await this.localStorage.get<EncryptionOptions>(ENCRYPTION_OPTIONS_KEY);
  }
  
  async setEncryptionOptions(options: EncryptionOptions) {
    await this.localStorage.set(ENCRYPTION_OPTIONS_KEY, options);
  }

  static supportsCryptoAPI(): boolean {
    return !!(crypto && crypto.subtle)
  }
}
