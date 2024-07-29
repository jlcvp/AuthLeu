import { Injectable } from '@angular/core';
import { Account2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { RemoteAccount2faService } from './remote-account2fa.service';
import { LocalAccount2faService } from './local-account2fa.service';
import { AppConfigService } from '../app-config.service';

@Injectable({
  providedIn: 'root'
})
export class Account2faService {
  private accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  private _service: IAccount2FAProvider | undefined;
  
  get service(): IAccount2FAProvider {
    if (!this._service) {
      throw new Error('Service not initialized')
    }
    return this._service
  }

  constructor(private appConfig: AppConfigService, private remoteService: RemoteAccount2faService, private localService: LocalAccount2faService) {
    const useRemoteService = !environment.isOfflineEnv
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
    this.accounts$ = await this.service.getAccounts()
    return this.accounts$
  }

  public async clearCache() {
    if (this.service.clearCache) {
      await this.service.clearCache()
    }
  }

  useLocalService() {
    this._service = this.localService
  }

  useRemoteService() {
    this._service = this.remoteService
  }
}
