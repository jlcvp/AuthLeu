import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Account2FA } from 'src/app/models/account2FA.model';

@Component({
  selector: 'app-account-list',
  templateUrl: './account-list.component.html',
  styleUrls: ['./account-list.component.scss'],
})
export class AccountListComponent {
  @Input() accounts: Account2FA[] = [];
  @Input() type: "list" | "grid" = "list";
  @Output() accountSelected = new EventEmitter<Account2FA>();
  @Output() newAccountClick = new EventEmitter<void>();
  
  constructor() { }

  selectAccount(account: Account2FA) {
    this.accountSelected.emit(account);
  }

  addAccount() {
    this.newAccountClick.emit();
  }

  get isGridType() {
    return this.type === "grid";
  }

  itemTrackBy(_index: number, account: Account2FA) {
    return account.id;
  }
}