import { inject, Injectable } from '@angular/core';
import { Account2FA, IAccount2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { AuthenticationService } from '../authentication.service';
import { clearIndexedDbPersistence, collection, collectionData, doc, Firestore, orderBy, query, runTransaction, serverTimestamp, setDoc, terminate, where } from '@angular/fire/firestore';
import { LocalAccount2faService } from './local-account2fa.service';

@Injectable({
  providedIn: 'root'
})
export class RemoteAccount2faService implements IAccount2FAProvider {
  private loaded = false
  private firestore: Firestore = inject(Firestore)
  private remoteAccounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  private localAccounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  private accountsSubject: BehaviorSubject<Account2FA[]> = new BehaviorSubject<Account2FA[]>([]);
  private accounts$: Observable<Account2FA[]>

  constructor(private authService: AuthenticationService, private localAccountService: LocalAccount2faService) {
    this.accounts$ = this.accountsSubject.asObservable()
  }

  async getAccounts(): Promise<Observable<Account2FA[]>> {
    if(!this.loaded) {
      await this.loadAccounts()
    }
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
    this.updateAccountsBatch([account])
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

  public async clearCache() {
    await terminate(this.firestore)
    await clearIndexedDbPersistence(this.firestore)
  }

  private async loadAccounts() {
    try {
      this.localAccounts$ = await this.localAccountService.getAccounts()
      
      // all updates will go through the local service, 
      // but let's wait a bit before exitting this function to give a chance for the remote service to have a value before emitting the first value
      this.localAccounts$.subscribe(accounts => {
        // forward to the main accountsSubject
        console.log("emmiting:", {accounts})
        this.accountsSubject.next(accounts)
      })
      // start a timeout to give a chance for the remote service to load
      const timeoutPromise = new Promise<'timeout'>((resolve) => { setTimeout(resolve, 2500, "timeout")});
      
      const remoteLoadPromise = this.loadRemoteAccounts() // load remote accounts
      // race the two promises
      const race = await Promise.race([remoteLoadPromise, timeoutPromise])
      console.log("Race won by: ", race || 'remoteLoadPromise')

    } catch (error) {
      console.error('Failed to load remote accounts', {error})
    }
    // delay a little bit more before resolving to let the local service settle the first value
    // await new Promise((resolve, _) => { setTimeout(resolve, 500)});
    console.log("Loaded accounts")
    this.loaded = true
  }

  private async loadRemoteAccounts() {
    const userId = await this.authService.getCurrentUserId()
    if(!userId) {
      throw new Error('INVALID_SESSION')
    }

    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)

    // by default, order by added date
    const q = query(accountCollection, orderBy('added', 'asc'), where('active', '==', true))
    this.remoteAccounts$ = collectionData(q).pipe(map(accounts => {
        return accounts.map(account => Account2FA.fromDictionary(account as IAccount2FA)) 
    }))

    // router all updates to the local service, replacing existing accounts
    this.remoteAccounts$.subscribe(accounts => {
      this.localAccountService.updateAccountsBatch(accounts, true)
    })
  }

  private createId(): string {
    return doc(collection(this.firestore, '_')).id
  }
}
