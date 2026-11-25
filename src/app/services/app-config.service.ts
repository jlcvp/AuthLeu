import { Injectable } from '@angular/core';
import { LocalStorageService } from './local-storage.service';
import { environment } from 'src/environments/environment';
import { ENCRYPTION_OPTIONS_DEFAULT, ENCRYPTION_OPTIONS_KEY, ENCRYPTION_OPTIONS_PASSWORD_KEY, EncryptionOptions, LAST_PASSWORD_CHECK_KEY } from '../models/encryption-options.model';
import { AppVersionInfo } from '../models/app-version.enum';
import { VAULT_OPTIONS_DEFAULT, VAULT_OPTIONS_KEY, VaultOptions } from '../models/vault.model';

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {

  constructor(private localStorage: LocalStorageService) { }

  get versionInfo(): AppVersionInfo {
    return environment.versionConfig;
  }

  async isOfflineMode() {
    // until the user chooses, use the build's default (the GitHub Pages build is offline-only)
    return (await this.localStorage.get<boolean>('isOfflineMode')) ?? environment.isOfflineEnv;
  }

  async setOfflineMode(isOffline: boolean) {
    await this.localStorage.set('isOfflineMode', isOffline);
  }

  isOfflineEnv() {
    return environment.isOfflineEnv;
  }

  async getEncryptionOptions(): Promise<EncryptionOptions> {
    return (await this.localStorage.get<EncryptionOptions>(ENCRYPTION_OPTIONS_KEY)) || { ...ENCRYPTION_OPTIONS_DEFAULT };
  }
  
  async setEncryptionOptions(options: EncryptionOptions) {
    await this.localStorage.set(ENCRYPTION_OPTIONS_KEY, options);
  }

  async getVaultOptions(): Promise<VaultOptions> {
    return { ...VAULT_OPTIONS_DEFAULT, ...(await this.localStorage.get<Partial<VaultOptions>>(VAULT_OPTIONS_KEY)) };
  }

  async setVaultOptions(options: Partial<VaultOptions>) {
    await this.localStorage.set(VAULT_OPTIONS_KEY, { ...(await this.getVaultOptions()), ...options });
  }

  /** The encryption password stored by 2.x. 3.0 stores no password; the 3.0.0 migration deletes it */
  async getLegacyEncryptionPassword() {
    return await this.localStorage.get<string>(ENCRYPTION_OPTIONS_PASSWORD_KEY);
  }

  async clearLegacyEncryptionPassword() {
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
