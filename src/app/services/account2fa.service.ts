import { inject, Injectable } from '@angular/core';
import { Account2FA } from '../models/account2FA.model';
import { clearIndexedDbPersistence, collection, collectionData, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class Account2faService {
  private firestore: Firestore = inject(Firestore)
  private accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();
  
  constructor() {}

  public loadAccounts(userId: string) {
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)

    this.accounts$ = collectionData(accountCollection) as Observable<Account2FA[]>
  }
  
  public getAccounts(): Observable<Account2FA[]> {
    return this.accounts$.pipe(map(accounts => accounts.map(account => Account2FA.fromDictionary(account))))
  }

  public async addAccount(userId: string, account: Account2FA): Promise<string> {
    console.log("Adding account", {account, userId})
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)
    const id = this.createId()
    const document = doc(accountCollection, id)
    
    account.id = id
    await setDoc(document, account.typeErased())
    return id
  }

  public async clearCache() {
    await clearIndexedDbPersistence(this.firestore)
  }

  private createId(): string {
    return doc(collection(this.firestore, '_')).id
  }
}
