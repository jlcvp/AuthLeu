import { inject, Injectable } from '@angular/core';
import { Account2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { BehaviorSubject, map, Observable, retry, Subscription, tap, timer } from 'rxjs';
import { AuthenticationService } from '../authentication.service';
import { clearIndexedDbPersistence, collection, collectionData, deleteDoc, doc, DocumentData, Firestore, getDoc, orderBy, query, runTransaction, serverTimestamp, setDoc, terminate, where } from '@angular/fire/firestore';
import { LocalAccount2faService } from './local-account2fa.service';
import { VaultRecord } from '../../models/vault.model';

@Injectable({
  providedIn: 'root'
})
export class RemoteAccount2faService implements IAccount2FAProvider {
  private loading?: Promise<void>
  private firestore: Firestore = inject(Firestore)
  private accountsSubject: BehaviorSubject<Account2FA[]> = new BehaviorSubject<Account2FA[]>([]);
  private accounts$: Observable<Account2FA[]>
  private syncErrorSubject = new BehaviorSubject<unknown>(undefined)
  private subscriptions: Subscription[] = []

  /** The error that currently prevents the accounts from syncing, or undefined while they sync */
  readonly syncError$ = this.syncErrorSubject.asObservable()

  constructor(private authService: AuthenticationService, private localAccountService: LocalAccount2faService) {
    this.accounts$ = this.accountsSubject.asObservable()
  }

  async getAccounts(): Promise<Observable<Account2FA[]>> {
    this.loading ??= this.loadAccounts() // load only once, even for concurrent calls
    await this.loading
    return this.accounts$
  }

  async addAccount(account: Account2FA): Promise<string> {
    const userId = await this.authService.getCurrentUserId()
    if(!userId) {
      throw new Error('INVALID_SESSION')
    }
    console.log("Adding account", {account})
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)
    
    const id = this.createId()
    const document = doc(accountCollection, id)
    account.id = id

    const timestamp = serverTimestamp()
    account.added = timestamp
    await setDoc(document, account.typeErased())
    return id
  }

  async updateAccount(account: Account2FA): Promise<void> {
    return this.updateAccountsBatch([account])
  }

  public async updateAccountsBatch(accounts: Account2FA[]): Promise<void> {
    const userId = await this.authService.getCurrentUserId()
    if(!userId) {
      throw new Error('INVALID_SESSION')
    }
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)
    await runTransaction(this.firestore, async transaction => {
      console.log("Updating accounts batch", {accounts})
      for(const account of accounts) {
        const document = doc(accountCollection, account.id)
        transaction.set(document, account.typeErased())
      }
    })
  }

  // The vault record is kept in Firestore, so other devices can unlock with the same password,
  // and copied to the local service, so this device can unlock while the server can't be reached

  async getVaultRecord(): Promise<VaultRecord | undefined> {
    let record: VaultRecord | undefined
    try {
      record = await this.readVaultDocument(await this.requireUserId())
    } catch (error) {
      console.warn('Failed to read the vault record, using the local copy', {error})
      return this.localAccountService.getVaultRecord()
    }
    await (record ? this.localAccountService.updateVaultRecord(record) : this.localAccountService.deleteVaultRecord())
    return record
  }

  async createVaultRecord(record: VaultRecord): Promise<VaultRecord> {
    const saved = await this.createVaultDocument(await this.requireUserId(), record)
    await this.localAccountService.updateVaultRecord(saved)
    return saved
  }

  async updateVaultRecord(record: VaultRecord): Promise<void> {
    await this.writeVaultDocument(await this.requireUserId(), record)
    await this.localAccountService.updateVaultRecord(record)
  }

  async deleteVaultRecord(): Promise<void> {
    await this.writeVaultDocument(await this.requireUserId(), undefined)
    await this.localAccountService.deleteVaultRecord()
  }

  public async clearCache() {
    // stop listening first: once Firestore is terminated, the listeners would fail and keep retrying
    this.subscriptions.forEach(subscription => subscription.unsubscribe())
    this.subscriptions = []
    await terminate(this.firestore)
    await clearIndexedDbPersistence(this.firestore)
  }

  private async loadAccounts() {
    try {
      // all updates go through the local service, which keeps a copy of the remote accounts
      const localAccounts$ = await this.localAccountService.getAccounts()
      this.subscriptions.push(localAccounts$.subscribe(accounts => {
        console.log("emmiting:", {accounts})
        this.accountsSubject.next(accounts)
      }))
    } catch (error) {
      console.error('Failed to load local accounts', {error})
    }

    try {
      await this.syncRemoteAccounts()
    } catch (error) {
      console.error('Failed to sync remote accounts', {error})
      this.syncErrorSubject.next(error)
    }
    console.log("Loaded accounts")
  }

  private async syncRemoteAccounts() {
    const userId = await this.authService.getCurrentUserId()
    if(!userId) {
      throw new Error('INVALID_SESSION')
    }

    // keep the local copy in sync with the remote accounts. A listener stops at its first error,
    // so report it and listen again after a delay that grows while the errors continue
    this.subscriptions.push(this.listenToAccounts(userId).pipe(
      map(documents => this.readAccounts(documents)),
      tap({ error: error => {
        console.error('Failed to sync remote accounts', {error})
        this.syncErrorSubject.next(error)
      } }),
      retry({
        delay: (_error, retryCount) => timer(Math.min(5000 * 2 ** (retryCount - 1), 5 * 60 * 1000)),
        resetOnSuccess: true,
      }),
    ).subscribe(accounts => {
      this.syncErrorSubject.next(undefined)
      this.localAccountService.updateAccountsBatch(accounts, true).catch(error => {
        console.error('Failed to save synced accounts', {error})
      })
    }))
  }

  /** Listens to the user's active accounts, ordered by the date they were added */
  protected listenToAccounts(userId: string): Observable<DocumentData[]> {
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)
    return collectionData(query(accountCollection, orderBy('added', 'asc'), where('active', '==', true)))
  }

  /** Reads the vault record from Firestore, or from its cache while offline */
  protected async readVaultDocument(userId: string): Promise<VaultRecord | undefined> {
    const snapshot = await getDoc(this.vaultDocument(userId))
    return snapshot.exists() ? snapshot.data() as VaultRecord : undefined
  }

  /** Saves the vault record unless one already exists, and returns the saved or the existing record */
  protected async createVaultDocument(userId: string, record: VaultRecord): Promise<VaultRecord> {
    const document = this.vaultDocument(userId)
    return runTransaction(this.firestore, async transaction => {
      const snapshot = await transaction.get(document)
      if (snapshot.exists()) {
        return snapshot.data() as VaultRecord
      }
      transaction.set(document, record)
      return record
    })
  }

  /** Replaces the vault record, or deletes it when undefined */
  protected async writeVaultDocument(userId: string, record: VaultRecord | undefined): Promise<void> {
    const document = this.vaultDocument(userId)
    await (record ? setDoc(document, record) : deleteDoc(document))
  }

  private vaultDocument(userId: string) {
    return doc(this.firestore, `accounts2fa/${userId}/vault/current`)
  }

  private async requireUserId(): Promise<string> {
    const userId = await this.authService.getCurrentUserId()
    if (!userId) {
      throw new Error('INVALID_SESSION')
    }
    return userId
  }

  /** Reads the accounts in the given documents, skipping the ones that aren't valid accounts */
  private readAccounts(documents: DocumentData[]): Account2FA[] {
    const accounts: Account2FA[] = []
    for (const document of documents) {
      try {
        accounts.push(Account2FA.fromDictionary(document))
      } catch (error) {
        console.error('Skipping an invalid synced account', {error})
      }
    }
    return accounts
  }

  private createId(): string {
    return doc(collection(this.firestore, '_')).id
  }
}
