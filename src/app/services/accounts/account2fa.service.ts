import { Injectable } from '@angular/core';
import { Account2FA, IAccount2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { firstValueFrom, mergeMap, Observable } from 'rxjs';
import { RemoteAccount2faService } from './remote-account2fa.service';
import { LocalAccount2faService } from './local-account2fa.service';
import { AppConfigService } from '../app-config.service';
import { TranslateService } from '@ngx-translate/core';
import { LogoService } from '../logo.service';

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
    private logoService: LogoService,
    private remoteService: RemoteAccount2faService,
    private localService: LocalAccount2faService,
    private translateService: TranslateService) {

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
   * Retrieves accounts, automatically decrypting them if necessary.
   * @returns An observable of the list of accounts.
   */
  public async getAccounts(): Promise<Observable<Account2FA[]>> {
    // Get the observable of accounts from the service
    const accounts$ = await this.service.getAccounts();

    // If a decryption key is provided, decrypt the accounts
    return accounts$.pipe(
      mergeMap(async (accounts) => {
        const key = await this.appConfig.getEncryptionKey() // always get updated key
        if (key) {
          const decryptions: Promise<void>[] = [];
          // Iterate over each account and decrypt if necessary
          for (const account of accounts) {
            if (account.isLocked) {
              decryptions.push(account.unlock(key));
            }
          }

          // Wait for all decryption promises to resolve
          const results = await Promise.allSettled(decryptions);
          for (const result of results) {
            if (result.status === 'rejected') {
              console.error('Failed to unlock account', { reason: result.reason })
            }
          }
        }

        // Return the decrypted accounts
        return accounts;
      })
    );
  }

  /**
   * Updates an existing account with new information.
   * 
   * @param account - The account object containing updated information.
   * @returns A promise that resolves when the account has been updated.
   */
  public async updateAccount(account: Account2FA) {
    if (account.secret && account.encryptedSecret && account.iv && account.salt) {
      account.secret = '' // clear decoded secret for encrypted accounts
    }
    return this.service.updateAccount(account)
  }

  /**
   * Updates multiple accounts with new information.
   * 
   * @param accounts - The array of account objects containing updated information.
   * @returns A promise that resolves when the accounts have been updated.
   */
  public async updateAccountsBatch(accounts: Account2FA[]) {
    for (const account of accounts) {
      if (account.secret && account.encryptedSecret && account.iv && account.salt) {
        account.secret = '' // clear decoded secret for encrypted accounts
      }
    }
    return this.service.updateAccountsBatch(accounts)
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
  public async exportAccounts(accountsArray: Account2FA[], encrypted: boolean = false) {
    // copy accounts to avoid modifying the original array
    accountsArray = accountsArray.map(account => account.copy())
    // encrypt accounts if needed
    if (encrypted) {
      const password = await this.appConfig.getEncryptionKey()
      if(password) {
        for (const account of accountsArray) {
          if (account.secret) {
            await account.lock(password)
          }
        }
      }
    }
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
    const password = await this.appConfig.getEncryptionKey()
    for (const account of accounts) {
        if (password && !account.isLocked) {    
          await account.lock(password)
        }
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
      reader.onload = async (e) => {
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
            
            // load logo images
            const promises: Promise<void>[] = []

            for (const account of accounts) {
              if (account.logo && account.logo.startsWith('http')) {
                const logo = account.logo
                const p = new Promise<void>(async (resolve) => {
                  try {
                    account.logo = await this.logoService.downloadImageAsBase64(logo)
                  } catch (error) {
                    console.warn('Error downloading logo (Using original URL instead)', error)
                  }
                  resolve()
                })
                promises.push(p)
              }
            }

            await Promise.all(promises)
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

  public async encryptAccounts() {
    const accounts = (await firstValueFrom(await this.service.getAccounts())).map(account => account.copy())
    const encryptionKey = await this.appConfig.getEncryptionKey()
    if (!encryptionKey) {
      const errorText = await firstValueFrom(this.translateService.get('ACCOUNT_SERVICE.ERROR.NO_ENCRYPTION_KEY'))
      throw new Error(errorText)
    }

    const encryptions: Promise<void>[] = []
    for (const account of accounts) {
      if (!account.isLocked) {
        encryptions.push(account.lock(encryptionKey))
      }
    }

    await Promise.all(encryptions)
    await this.updateAccountsBatch(accounts)
  }

  public async decryptAccounts() {
    const accounts = (await firstValueFrom(await this.service.getAccounts())).map(account => account.copy())
    
    console.log("decrypting accounts", accounts)
    const encryptionKey = await this.appConfig.getEncryptionKey()
    if (!encryptionKey) {
      const errorText = await firstValueFrom(this.translateService.get('ACCOUNT_SERVICE.ERROR.NO_ENCRYPTION_KEY'))
      throw new Error(errorText)
    }

    const decryptions: Promise<void>[] = []
    for (const account of accounts) {
      if (account.encryptedSecret && account.iv && account.salt) {
        decryptions.push(account.unlock(encryptionKey))
      }
    }

    await Promise.all(decryptions)
    await this.updateAccountsBatch(accounts)
  }
}
