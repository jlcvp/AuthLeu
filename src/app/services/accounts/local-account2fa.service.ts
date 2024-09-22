import { Injectable } from '@angular/core';
import { Account2FA, IAccount2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { BehaviorSubject, Observable } from 'rxjs';
import { LocalStorageService } from '../local-storage.service';
import { CryptoUtils } from 'src/app/utils/crypto-utils';

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
      this.accountsSubject.next(this.accounts)
    }, 100);
    return this.accountsSubject.asObservable()
  }

  async addAccount(account: Account2FA): Promise<string> {
    await this.loadAccountsFromStorage()

    const id = this.createId()
    account.id = id

    const timestamp = Date.now()
    account.added = timestamp

    this.accounts.push(account)
    this.sortAccounts()
    await this.localStorage.set('local_accounts', this.accounts)

    this.accountsSubject.next(this.accounts)
    return id
  }

  async updateAccount(account: Account2FA): Promise<void> {
    return this.updateAccountsBatch([account])
  }

  async updateAccountsBatch(accounts: Account2FA[]): Promise<void> {
    await this.loadAccountsFromStorage()
    for (const account of accounts) {
      this.updateAccountData(account)
    }
    this.persistAccounts()
    this.accountsSubject.next(this.accounts)
  }

  private updateAccountData(account: Account2FA): void {
    const index = this.accounts.findIndex(a => a.id === account.id)
    if (!index) {
      throw new Error('ACCOUNT_SERVICE.ERROR.ACCOUNT_NOT_FOUND')
    }

    this.accounts[index] = account
  }

  private async persistAccounts() {
    this.sortAccounts()
    await this.localStorage.set('local_accounts', this.accounts)
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
      const bytes = CryptoUtils.randomBytes(40);
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
    this.accounts = this.accounts.sort((a, b) => a.added - b.added)
  }
}
