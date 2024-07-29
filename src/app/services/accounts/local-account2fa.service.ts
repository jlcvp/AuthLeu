import { Injectable } from '@angular/core';
import { Account2FA, IAccount2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { BehaviorSubject, Observable } from 'rxjs';
import { LocalStorageService } from '../local-storage.service';
import { GlobalUtils } from 'src/app/utils/global-utils';

@Injectable({
  providedIn: 'root'
})
export class LocalAccount2faService implements IAccount2FAProvider {
  private loaded = false
  private accountsSubject: BehaviorSubject<Account2FA[]>
  private accounts: Account2FA[] = []

  constructor(private localStorage: LocalStorageService) {
    this.accounts = []
    this.accountsSubject = new BehaviorSubject<Account2FA[]>([]);
  }

  async getAccounts(): Promise<Observable<Account2FA[]>> {
    await this.loadAccountsFromStorage()
    this.sortAccounts()
    setTimeout(() => {
      console.log("Accounts", {accounts: this.accounts})
      this.accountsSubject.next(this.accounts)
    }, 100);
    return this.accountsSubject.asObservable()
  }

  async addAccount(account: Account2FA): Promise<string> {
    await this.loadAccountsFromStorage()

    const id = this.createId()
    account.id = id

    const timestamp = new Date()
    account.added = timestamp

    this.accounts.push(account)
    this.sortAccounts()
    await this.localStorage.set('local_accounts', this.accounts)

    this.accountsSubject.next(this.accounts)
    return id
  }

  private async loadAccountsFromStorage() {
    if (this.loaded) {
      return
    }

    const accounts = (await this.localStorage.get<IAccount2FA[]>('local_accounts')) || []
    this.accounts = accounts.map(account => Account2FA.fromDictionary(account))
    this.sortAccounts()
    this.loaded = true
    this.accountsSubject.next(this.accounts)
  }

  private createId(): string {
    // Copied from firebase sdk implementation
    // Alphanumeric characters
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    // The largest byte value that is a multiple of `char.length`.
    const maxMultiple = Math.floor(256 / chars.length) * chars.length;


    let autoId = '';
    const targetLength = 20;
    while (autoId.length < targetLength) {
      const bytes = GlobalUtils.randomBytes(40);
      for (let i = 0; i < bytes.length; ++i) {
        // Only accept values that are [0, maxMultiple), this ensures they can
        // be evenly mapped to indices of `chars` via a modulo operation.
        if (autoId.length < targetLength && bytes[i] < maxMultiple) {
          autoId += chars.charAt(bytes[i] % chars.length);
        }
      }
    }

    return autoId;
  }

  private sortAccounts() {
    this.accounts.sort((a, b) => {
      if (a.added > b.added) {
        return -1
      } else if (a.added < b.added) {
        return 1
      } else {
        return 0
      }
    })
  }
}
