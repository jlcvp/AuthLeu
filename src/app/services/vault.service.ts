import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DataKey, VAULT_KDF_ITERATIONS, VaultRecord } from '../models/vault.model';
import { CryptoUtils } from '../utils/crypto-utils';
import { AppConfigService } from './app-config.service';
import { LocalStorageService } from './local-storage.service';

/** Storage key of the data key remembered on this device */
const REMEMBERED_DATA_KEY = 'vaultDataKey';

/**
 * Holds the data key that encrypts the account secrets while it's unlocked. The password is never
 * stored: it only unwraps the data key. When the user wants to be remembered on this device (the
 * default), the unlocked data key is stored as a CryptoKey that can't be exported.
 */
@Injectable({
  providedIn: 'root'
})
export class VaultService {
  /** PBKDF2 iterations for new data keys and password changes */
  kdfIterations = VAULT_KDF_ITERATIONS

  private dataKeySubject = new BehaviorSubject<DataKey | undefined>(undefined)

  /** The unlocked data key, or undefined while locked */
  readonly dataKey$ = this.dataKeySubject.asObservable()

  constructor(private localStorage: LocalStorageService, private appConfig: AppConfigService) { }

  /** The unlocked data key, or undefined while locked */
  get dataKey(): DataKey | undefined {
    return this.dataKeySubject.value
  }

  /**
   * Creates a new data key protected by the password, and unlocks it.
   * @returns The record to store, which holds the wrapped data key.
   */
  async create(password: string): Promise<VaultRecord> {
    const { record, dataKey } = await CryptoUtils.shared.createDataKey(password, this.kdfIterations)
    await this.setDataKey(dataKey)
    return record
  }

  /**
   * Unlocks the data key of a record with the password.
   * @throws {Error} 'VAULT.INVALID_PASSWORD' if the password is wrong.
   */
  async unlock(record: VaultRecord, password: string): Promise<void> {
    await this.setDataKey(await CryptoUtils.shared.unlockDataKey(record, password))
  }

  /**
   * Unlocks the data key remembered on this device, if it's the data key of the record.
   * @returns Whether the data key was unlocked.
   */
  async restore(record: VaultRecord): Promise<boolean> {
    const remembered = await this.localStorage.get<DataKey>(REMEMBERED_DATA_KEY)
    if (!remembered) {
      return false
    }
    if (remembered.keyId !== record.keyId || !(remembered.key instanceof CryptoKey)) {
      await this.localStorage.remove(REMEMBERED_DATA_KEY) // left over from another data key
      return false
    }
    this.dataKeySubject.next(remembered)
    return true
  }

  /**
   * Wraps the data key of a record with a new password. The data key doesn't change.
   * @returns The record to store instead.
   * @throws {Error} 'VAULT.INVALID_PASSWORD' if the old password is wrong.
   */
  async changePassword(record: VaultRecord, oldPassword: string, newPassword: string): Promise<VaultRecord> {
    return CryptoUtils.shared.rewrapDataKey(record, oldPassword, newPassword, this.kdfIterations)
  }

  /** Checks a password against a record, without unlocking it */
  async verifyPassword(record: VaultRecord, password: string): Promise<boolean> {
    try {
      await CryptoUtils.shared.unlockDataKey(record, password)
      return true
    } catch {
      return false
    }
  }

  /** Removes the data key from memory. A data key remembered on this device is kept */
  lock(): void {
    this.dataKeySubject.next(undefined)
  }

  /** Removes the data key from memory and from this device */
  async forget(): Promise<void> {
    this.lock()
    await this.localStorage.remove(REMEMBERED_DATA_KEY)
  }

  /** Whether the unlocked data key is kept on this device */
  async isRemembered(): Promise<boolean> {
    return (await this.appConfig.getVaultOptions()).rememberUnlock
  }

  /** Sets whether the unlocked data key is kept on this device, storing or removing the current one */
  async setRemembered(remembered: boolean): Promise<void> {
    await this.appConfig.setVaultOptions({ rememberUnlock: remembered })
    if (remembered && this.dataKey) {
      await this.remember(this.dataKey)
    } else if (!remembered) {
      await this.localStorage.remove(REMEMBERED_DATA_KEY)
    }
  }

  private async setDataKey(dataKey: DataKey): Promise<void> {
    this.dataKeySubject.next(dataKey)
    if (await this.isRemembered()) {
      await this.remember(dataKey)
    }
  }

  private async remember(dataKey: DataKey): Promise<void> {
    await this.localStorage.set(REMEMBERED_DATA_KEY, dataKey)
    // only IndexedDB can store a CryptoKey; other storage drivers serialize it into an unusable object
    const stored = await this.localStorage.get<DataKey>(REMEMBERED_DATA_KEY)
    if (!(stored?.key instanceof CryptoKey)) {
      console.warn('Unable to remember the data key on this device')
      await this.localStorage.remove(REMEMBERED_DATA_KEY)
    }
  }
}
