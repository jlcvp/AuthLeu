import { Injectable } from '@angular/core';
import { Account2FA, IAccount2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { firstValueFrom, Observable } from 'rxjs';
import { RemoteAccount2faService } from './remote-account2fa.service';
import { LocalAccount2faService } from './local-account2fa.service';
import { AppConfigService } from '../app-config.service';

@Injectable({
  providedIn: 'root'
})
export class Account2faService {
  private _service: IAccount2FAProvider | undefined;

  get service(): IAccount2FAProvider {
    if (!this._service) {
      throw new Error('Service not initialized')
    }
    return this._service
  }

  constructor(private appConfig: AppConfigService,
    private remoteService: RemoteAccount2faService,
    private localService: LocalAccount2faService) {
    
    this.setupService()
  }

  private async setupService() {
    if (await this.appConfig.isOfflineMode()) {
      this._service = this.localService
    } else {
      this._service = this.remoteService
    }
  }

  public async addAccount(account: Account2FA): Promise<string> {
    return this.service.addAccount(account)
  }

  public async getAccounts(): Promise<Observable<Account2FA[]>> {
    const accounts$ = await this.service.getAccounts()
    return accounts$
  }

  public async clearCache() {
    if (this.service.clearCache) {
      await this.service.clearCache()
    }
  }

  public async exportAccounts(accountsArray: Account2FA[]) {
    const data = JSON.stringify(accountsArray, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'AuthLeu-accounts.json'
    a.click()
    a.remove()
  }

  public async importAccounts(accounts: Account2FA[]) {
    for (const account of accounts) {
      await this.addAccount(account)
    }
  }

  public readAccountsFromFile(file: File): Promise<Account2FA[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = e.target?.result as string | undefined
          if (!data) {
            throw new Error('ACCOUNT_SYNC.ERROR.EMPTY_FILE')
          }

          // check if file is a valid json
          try {
            const anyArray = JSON.parse(data)
            if (!Array.isArray(anyArray)) {
              throw new Error('Not an array')
            }
            
            const accountsDict = JSON.parse(data) as IAccount2FA[]
            const accounts = accountsDict.map(a => Account2FA.fromDictionary(a))
            resolve(accounts)
          } catch (error) {
            console.error('Error parsing backup file', { error })
            throw new Error('ACCOUNT_SYNC.ERROR.CORRUPT_BACKUP_FILE')
          }
        } catch (error) {
          reject(error)
          return
        }
      }
      reader.readAsText(file)
    })
  }

  useLocalService() {
    this._service = this.localService
  }

  useRemoteService() {
    this._service = this.remoteService
  }
}
