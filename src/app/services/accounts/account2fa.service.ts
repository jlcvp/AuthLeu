import { Injectable } from '@angular/core';
import { Account2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { combineLatest, firstValueFrom, Observable, of, switchMap } from 'rxjs';
import { RemoteAccount2faService } from './remote-account2fa.service';
import { LocalAccount2faService } from './local-account2fa.service';
import { AppConfigService } from '../app-config.service';
import { LogoService } from '../logo.service';
import { VaultService } from '../vault.service';
import { DataKey, VaultRecord } from '../../models/vault.model';

/** How saved secrets must be encrypted when encryption is set up: with the data key, undefined while locked */
interface SaveEncryption {
  dataKey?: DataKey
}

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
    private vault: VaultService) {

    this.setupService()
  }

  private async setupService() {
    if (await this.appConfig.isOfflineMode()) {
      this._service = this.localService
    } else {
      this._service = this.remoteService
    }
  }

  /**
   * Adds a new account, encrypting its secret if encryption is set up.
   * The given account keeps its plaintext secret and receives the new id.
   *
   * @param account - The account to add.
   * @returns A promise that resolves with the id of the new account.
   * @throws {Error} 'VAULT.LOCKED' if encryption is set up but locked.
   */
  public async addAccount(account: Account2FA): Promise<string> {
    const encryption = await this.getSaveEncryption()
    const id = await this.service.addAccount(await this.toStoredAccount(account, encryption))
    account.id = id
    return id
  }

  /**
   * Retrieves the accounts, decrypting the secrets encrypted with the unlocked data key.
   * @returns An observable of the list of accounts, emitting again when the data key is locked or unlocked.
   */
  public async getAccounts(): Promise<Observable<Account2FA[]>> {
    const accounts$ = await this.service.getAccounts();

    // Decrypt copies, so the provider keeps the encrypted secrets and locking discards the decrypted
    // ones. Decryptions can finish out of order, so a newer list of accounts discards an older one
    return combineLatest([accounts$, this.vault.dataKey$]).pipe(
      switchMap(([accounts, dataKey]) => this.decryptAccounts(accounts, dataKey))
    );
  }

  /**
   * Updates an existing account with new information, encrypting its secret if encryption is set up.
   *
   * @param account - The account object containing updated information.
   * @returns A promise that resolves when the account has been updated.
   * @throws {Error} 'VAULT.LOCKED' if encryption is set up but locked.
   */
  public async updateAccount(account: Account2FA) {
    const encryption = await this.getSaveEncryption()
    return this.service.updateAccount(await this.toStoredAccount(account, encryption))
  }

  /**
   * Updates multiple accounts with new information, encrypting their secrets if encryption is set up.
   *
   * @param accounts - The array of account objects containing updated information.
   * @returns A promise that resolves when the accounts have been updated.
   * @throws {Error} 'VAULT.LOCKED' if encryption is set up but locked.
   */
  public async updateAccountsBatch(accounts: Account2FA[]) {
    const encryption = await this.getSaveEncryption()
    const storedAccounts = await Promise.all(accounts.map(account => this.toStoredAccount(account, encryption)))
    return this.service.updateAccountsBatch(storedAccounts)
  }

  public async clearCache() {
    if (this.service.clearCache) {
      await this.service.clearCache()
    }
  }

  /**
   * The error that currently prevents the accounts from syncing with the cloud,
   * or undefined while they sync (always undefined in offline mode).
   */
  get syncError$(): Observable<unknown> {
    return this.service.syncError$ ?? of(undefined)
  }

  /** The record of the data key that encrypts the secrets, if encryption is set up */
  public async getVaultRecord(): Promise<VaultRecord | undefined> {
    return this.service.getVaultRecord()
  }

  /** Whether the data key is unlocked */
  get isUnlocked(): boolean {
    return !!this.vault.dataKey
  }

  /**
   * Unlocks the data key with the password.
   * @throws {Error} 'VAULT.INVALID_PASSWORD' if the password is wrong.
   */
  public async unlock(password: string): Promise<void> {
    await this.vault.unlock(await this.requireVaultRecord(), password)
  }

  /**
   * Unlocks the data key remembered on this device, if there is one.
   * @returns Whether the data key was unlocked.
   */
  public async restoreUnlock(): Promise<boolean> {
    const record = await this.service.getVaultRecord()
    return record ? this.vault.restore(record) : false
  }

  /** Removes the data key, and so the decrypted secrets, from memory */
  public lock(): void {
    this.vault.lock()
  }

  /** Checks a password against the data key, without unlocking it */
  public async verifyPassword(password: string): Promise<boolean> {
    return this.vault.verifyPassword(await this.requireVaultRecord(), password)
  }

  /**
   * Changes the password that protects the data key. The secrets don't need to be encrypted again.
   * @throws {Error} 'VAULT.INVALID_PASSWORD' if the old password is wrong.
   */
  public async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const record = await this.vault.changePassword(await this.requireVaultRecord(), oldPassword, newPassword)
    await this.service.updateVaultRecord(record)
  }

  /**
   * Sets up encryption with a password: creates a data key, or unlocks the one another device set up
   * in the meantime, and encrypts the secrets saved in plaintext. If that fails, encryption stays off.
   * @throws {Error} 'VAULT.INVALID_PASSWORD' if another device set up encryption with another password.
   */
  public async enableEncryption(password: string): Promise<void> {
    const record = await this.vault.create(password)
    let createdRecord = false
    try {
      const savedRecord = await this.service.createVaultRecord(record)
      createdRecord = savedRecord.keyId === record.keyId
      if (!createdRecord) {
        await this.vault.unlock(savedRecord, password) // set up by another device first
      }
      await this.encryptPlaintextAccounts()
    } catch (error) {
      // the plaintext secrets are saved in a single write, so none were encrypted with the new data key
      if (createdRecord) {
        await this.service.deleteVaultRecord()
      }
      await this.vault.forget()
      throw error
    }
  }

  /**
   * Turns encryption off: saves every secret in plaintext, then deletes the data key.
   * @throws {Error} 'VAULT.INVALID_PASSWORD' or 'CRYPTO.INVALID_DECRYPTION_KEY' if the password is wrong.
   * Nothing changes then.
   */
  public async disableEncryption(password: string): Promise<void> {
    const record = await this.service.getVaultRecord()
    if (record) {
      await this.vault.unlock(record, password)
    }

    // decrypt everything before saving anything
    const accounts = await this.getStoredAccounts()
    for (const account of accounts) {
      if (account.isLegacyEncrypted) {
        await account.unlock(password)
      } else if (account.isEncrypted && this.vault.dataKey) {
        await account.unlockWithDataKey(this.vault.dataKey)
      }
    }

    // write through the provider directly: updateAccountsBatch would encrypt the secrets again
    await this.service.updateAccountsBatch(accounts)
    if (record) {
      await this.service.deleteVaultRecord()
    }
    await this.vault.forget()
  }

  /** Encrypts with the data key the secrets saved in plaintext, e.g. before encryption was set up or by an older version */
  public async encryptPlaintextAccounts(): Promise<void> {
    const dataKey = this.requireDataKey()
    const plaintextAccounts = (await this.getStoredAccounts()).filter(account => !account.isLocked)
    if (plaintextAccounts.length === 0) {
      return
    }
    for (const account of plaintextAccounts) {
      await account.lockWithDataKey(dataKey)
    }
    await this.service.updateAccountsBatch(plaintextAccounts)
  }

  /**
   * Re-encrypts with the data key the secrets that 2.x encrypted with a key derived from the password.
   * @throws {Error} 'CRYPTO.INVALID_DECRYPTION_KEY' if the password doesn't decrypt them. Nothing is saved then.
   */
  public async upgradeLegacyAccounts(password: string): Promise<void> {
    const dataKey = this.requireDataKey()
    const legacyAccounts = (await this.getStoredAccounts()).filter(account => account.isLegacyEncrypted)
    if (legacyAccounts.length === 0) {
      return
    }
    for (const account of legacyAccounts) {
      await account.unlock(password)
      await account.lockWithDataKey(dataKey)
    }
    await this.service.updateAccountsBatch(legacyAccounts)
  }

  /**
   * Exports the given accounts to a JSON file and triggers a download.
   * @param accountsArray - The array of accounts to export.
   * @param password - When given, the secrets are encrypted with it, in the format 2.x uses, so the file
   * can also be imported by older versions.
   */
  public async exportAccounts(accountsArray: Account2FA[], password?: string) {
    // copy accounts to avoid modifying the original array
    accountsArray = accountsArray.map(account => account.copy())
    if (password) {
      for (const account of accountsArray) {
        if (!account.isLocked) {
          await account.lock(password)
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
   * Adds the given accounts to the account provider, encrypting their secrets if encryption is set up.
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
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as string | undefined
          if (!data) {
            throw new Error('ACCOUNT_SYNC.ERROR.EMPTY_FILE')
          }

          // check if file is a valid json
          let accounts: Account2FA[]
          try {
            const accountsDict = JSON.parse(data)
            if (!Array.isArray(accountsDict)) {
              throw new Error('Not an array')
            }
            accounts = accountsDict.map(a => Account2FA.fromDictionary(a))
          } catch (error) {
            console.error('Error parsing backup file', { error })
            throw new Error('ACCOUNT_SYNC.ERROR.CORRUPT_BACKUP_FILE')
          }

          if (accounts.some(account => account.hasInvalidSecret)) {
            throw new Error('ACCOUNT_SYNC.ERROR.INVALID_SECRET')
          }

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
          reject(error)
          return
        }
      }
      reader.readAsText(file)
    })
  }

  /** Copies of the accounts as stored, with their secrets encrypted */
  private async getStoredAccounts(): Promise<Account2FA[]> {
    return (await firstValueFrom(await this.service.getAccounts())).map(account => account.copy())
  }

  /** Decrypts copies of the accounts whose secrets were encrypted with the data key */
  private async decryptAccounts(accounts: Account2FA[], dataKey?: DataKey): Promise<Account2FA[]> {
    // until the 3.0.0 migration replaces it with the data key (e.g. while it can't reach the server),
    // the password 2.x stored still decrypts the accounts 2.x encrypted
    const legacyPassword = accounts.some(account => account.isLegacyEncrypted)
      ? await this.appConfig.getLegacyEncryptionPassword()
      : undefined

    return Promise.all(accounts.map(async account => {
      const copy = account.copy()
      try {
        if (dataKey && copy.keyId === dataKey.keyId && copy.isLocked) {
          await copy.unlockWithDataKey(dataKey)
        } else if (legacyPassword && copy.isLegacyEncrypted && copy.isLocked) {
          await copy.unlock(legacyPassword)
        }
      } catch (error) {
        console.error('Failed to unlock account', { error })
      }
      return copy
    }))
  }

  /** How saved secrets must be encrypted, or undefined when encryption isn't set up */
  private async getSaveEncryption(): Promise<SaveEncryption | undefined> {
    const record = await this.service.getVaultRecord()
    if (!record) {
      return undefined
    }
    const dataKey = this.vault.dataKey
    return { dataKey: dataKey?.keyId === record.keyId ? dataKey : undefined }
  }

  private async requireVaultRecord(): Promise<VaultRecord> {
    const record = await this.service.getVaultRecord()
    if (!record) {
      throw new Error('VAULT.NOT_SET_UP')
    }
    return record
  }

  private requireDataKey(): DataKey {
    const dataKey = this.vault.dataKey
    if (!dataKey) {
      throw new Error('VAULT.LOCKED')
    }
    return dataKey
  }

  /**
   * Creates the copy of an account that gets persisted, so the given account is never modified.
   * When encryption is set up, the copy's secret is always encrypted. A plaintext secret is never
   * persisted alongside its encrypted form.
   *
   * @param account - The account to persist.
   * @param encryption - How the secret must be encrypted, when encryption is set up.
   * @returns The account copy to persist.
   * @throws {Error} 'VAULT.LOCKED' if the secret must be encrypted but the data key is locked.
   */
  private async toStoredAccount(account: Account2FA, encryption?: SaveEncryption): Promise<Account2FA> {
    const storedAccount = account.copy()
    if (encryption && !storedAccount.isLocked) {
      if (!encryption.dataKey) {
        throw new Error('VAULT.LOCKED')
      }
      await storedAccount.lockWithDataKey(encryption.dataKey)
    } else if (storedAccount.isEncrypted) {
      storedAccount.secret = ''
    }
    return storedAccount
  }
}
