import { Injectable } from '@angular/core';
import { LocalStorageService } from './local-storage.service';
import { environment } from 'src/environments/environment';
import { ENCRYPTION_OPTIONS_DEFAULT, ENCRYPTION_OPTIONS_KEY, ENCRYPTION_OPTIONS_PASSWORD_KEY, EncryptionOptions, LAST_PASSWORD_CHECK_KEY } from '../models/encryption-options.model';

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {

  constructor(private localStorage: LocalStorageService) { }

  get versionInfo() {
    return environment.versionConfig;
  }

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
    return (await this.localStorage.get<EncryptionOptions>(ENCRYPTION_OPTIONS_KEY)) || ENCRYPTION_OPTIONS_DEFAULT;
  }
  
  async setEncryptionOptions(options: EncryptionOptions) {
    await this.localStorage.set(ENCRYPTION_OPTIONS_KEY, options);
  }

  async getEncryptionKey() {
    return await this.localStorage.get<string>(ENCRYPTION_OPTIONS_PASSWORD_KEY);
  }

  async setEncryptionKey(key: string) {
    await this.localStorage.set(ENCRYPTION_OPTIONS_PASSWORD_KEY, key);
  }

  async clearEncryptionKey() {
    await this.localStorage.remove(ENCRYPTION_OPTIONS_PASSWORD_KEY);
  }

  async getLastPasswordCheck() {
    return await this.localStorage.get<number>(LAST_PASSWORD_CHECK_KEY) || 0;
  }

  async setLastPasswordCheck(timestamp?: number) {
    const lastCheck = timestamp || Date.now();
    await this.localStorage.set(LAST_PASSWORD_CHECK_KEY, lastCheck);
  }

  async isFirstRun() {
    return !!(await this.localStorage.get<boolean>('firstRun'));
  }

  async setFirstRun(firstRun = true) {
    await this.localStorage.set('firstRun', firstRun);
  }

  static supportsCryptoAPI(): boolean {
    return !!(crypto && crypto.subtle)
  }
}
