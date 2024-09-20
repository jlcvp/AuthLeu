import { Injectable } from '@angular/core';
import { Account2FA, IAccount2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { firstValueFrom, map, mergeMap, Observable } from 'rxjs';
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

  /**
   * Retrieves accounts, optionally decrypting them with the provided decryption key.
   * @param decryptionKey - Optional key to decrypt account secrets.
   * @returns An observable of the list of accounts.
   */
  public async getAccounts(decryptionKey?: string): Promise<Observable<Account2FA[]>> {
    // Get the observable of accounts from the service
    const accounts$ = await this.service.getAccounts();

    // If a decryption key is provided, decrypt the accounts
    if (decryptionKey) {
      return accounts$.pipe(
        mergeMap(async (accounts) => {
          const decryptions: Promise<void>[] = [];

          // Iterate over each account and decrypt if necessary
          for (const account of accounts) {
            if (!account.secret) {
              decryptions.push(account.unlock(decryptionKey));
            }
          }

          // Wait for all decryption promises to resolve
          await Promise.all(decryptions);

          // Return the decrypted accounts
          return accounts;
        })
      );
    }

    // If no decryption key is provided, return the accounts as is
    return accounts$;
  }

  /**
   * Updates an existing account with new information.
   * 
   * @param account - The account object containing updated information.
   * @returns A promise that resolves when the account has been updated.
   */
  public async updateAccount(account: Account2FA) {
    return this.service.updateAccount(account)
  }

  public async clearCache() {
    if (this.service.clearCache) {
      await this.service.clearCache()
    }
  }

  /**
   * Exports the given accounts to a JSON file and triggers a download.
   * @param accountsArray - The array of accounts to export.
   */
  public async exportAccounts(accountsArray: Account2FA[]) {
    // Convert the accounts array to a JSON string with indentation
    const data = JSON.stringify(accountsArray, null, 2);
    // Create a Blob from the JSON string
    const blob = new Blob([data], { type: 'application/json' });
    // Generate a URL for the Blob
    const url = URL.createObjectURL(blob);
    // Create a temporary anchor element to trigger the download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AuthLeu-accounts.json';

    // Trigger the download by simulating a click on the anchor element
    a.click();

    // Clean up by removing the anchor element
    a.remove();
  }

  /**
   * Adds the given accounts to the account provider.
   * @param accounts - The array of accounts to import.
   */
  public async importAccounts(accounts: Account2FA[]) {
    for (const account of accounts) {
      await this.addAccount(account)
    }
  }

  /**
   * Reads accounts from a file and returns them as an array of Account2FA objects.
   * @param file - The file to read accounts from.
   * @returns A promise that resolves with the array of accounts.
   */
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
}
