import { inject, Injectable } from '@angular/core';
import { Account2FA } from '../models/account2FA.model';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class Account2faService {
  private firestore: Firestore = inject(Firestore)
  private accounts$: Observable<Account2FA[]> = new Observable<Account2FA[]>();

  constructor() { }

  public loadAccounts(userId: string) {
    const accountCollection = collection(this.firestore, `accounts2fa/${userId}/accounts`)

    this.accounts$ = collectionData(accountCollection) as Observable<Account2FA[]>
  }
  
  public getAccounts(): Observable<Account2FA[]> {
    return this.accounts$.pipe(map(accounts => accounts.map(account => Account2FA.fromDictionary(account))))
  }
}
