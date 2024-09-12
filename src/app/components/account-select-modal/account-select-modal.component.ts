import { Component, Input, OnInit } from '@angular/core';
import { Config, ModalController } from '@ionic/angular';
import { Account2FA } from 'src/app/models/account2FA.model';

@Component({
  selector: 'app-account-select-modal',
  templateUrl: './account-select-modal.component.html',
  styleUrls: ['./account-select-modal.component.scss'],
})
export class AccountSelectModalComponent implements OnInit {
  @Input() accounts: Account2FA[] = []
  @Input() title: string = ''
  @Input() confirmText: string = ''
  
  selection: {account: Account2FA, selected: boolean}[] = []
  isMD: boolean
  constructor(private modalController: ModalController, config: Config) {
    this.isMD = config.get('mode') !== 'ios'
  }

  ngOnInit() {
    this.selection = this.accounts.map((account) => {
      return { account, selected: true }
    })
  }

  get selectedAccountsCount() {
    return this.selection.reduce((count, item) => count + (item.selected ? 1 : 0), 0)
  }

  get selectAllLabelKey(): string {
    const allSelected = this.selection.every((item) => item.selected)
    return allSelected ? 'ACCOUNT_SELECT_MODAL.DESELECT_ALL' : 'ACCOUNT_SELECT_MODAL.SELECT_ALL'
  }

  get selectionCountParams() {
    return {
      total: this.selection.length,
      selected: this.selectedAccountsCount
    }
  }

  onSelectAllClick() {
    const allSelected = this.selection.every((item) => item.selected)
    this.selection.forEach((item) => item.selected = !allSelected)
  }

  onItemClick(index: number) {
    this.selection[index].selected = !this.selection[index].selected
  }

  onConfirm() {
    const selectedAccounts = this.selection.filter((item) => item.selected).map((item) => item.account)
    this.modalController.dismiss(selectedAccounts)
  }

  closeModal() {
    this.modalController.dismiss()
  }

}
