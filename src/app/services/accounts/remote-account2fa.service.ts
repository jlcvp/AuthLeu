import { inject, Injectable } from '@angular/core';
import { Account2FA, IAccount2FA, IAccount2FAProvider } from '../../models/account2FA.model';
import { map, Observable } from 'rxjs';
import { AuthenticationService } from '../authentication.service';
import { clearIndexedDbPersistence, collection, collectionData, doc, Firestore, orderBy, query, serverTimestamp, setDoc, terminate, where, writeBatch } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class RemoteAccount2faService implements IAccount2FAProvider {
  private loaded = false
  private firestore: Firestore = inject(Firestore)
  private accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();

  constructor(private authService: AuthenticationService) { }

  async getAccounts(): Promise<Observable<Account2FA[]>> {
    if(!this.loaded) {
      await this.loadAccounts()
    }
    return this.accounts$.pipe(map(accounts => accounts.map(account => Account2FA.fromDictionary(account))))
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
    const userId = await this.authService.getCurrentUserId()
    if(!userId) {
      throw new Error('INVALID_SESSION')
    }
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)
    const document = doc(accountCollection, account.id)
    await setDoc(document, account.typeErased())
  }

  public async updateAccountsBatch(accounts: Account2FA[]): Promise<void> {
    const userId = await this.authService.getCurrentUserId()
    if(!userId) {
      throw new Error('INVALID_SESSION')
    }
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)
    const batch = writeBatch(this.firestore)
    for(const account of accounts) {
      const document = doc(accountCollection, account.id)
      batch.set(document, account.typeErased())
    }
    await batch.commit()
  }

  public async clearCache() {
    await terminate(this.firestore)
    await clearIndexedDbPersistence(this.firestore)
  }

  private async loadAccounts() {
    const userId = await this.authService.getCurrentUserId()
    if(!userId) {
      throw new Error('INVALID_SESSION')
    }

    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)

    // by default, order by added date
    const q = query(accountCollection, orderBy('added', 'asc'), where('active', '==', true))
    this.accounts$ = collectionData(q).pipe(map(accounts => {
        return accounts.map(account => Account2FA.fromDictionary(account as IAccount2FA)) 
    }))
    this.loaded = true
  }

  private createId(): string {
    return doc(collection(this.firestore, '_')).id
  }
}
