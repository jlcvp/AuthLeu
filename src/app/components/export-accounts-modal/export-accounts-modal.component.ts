import { Component, Input, OnInit } from '@angular/core';
import { Config, ModalController } from '@ionic/angular';
import { Account2FA } from 'src/app/models/account2FA.model';

@Component({
  selector: 'app-export-accounts-modal',
  templateUrl: './export-accounts-modal.component.html',
  styleUrls: ['./export-accounts-modal.component.scss'],
})
export class ExportAccountsModalComponent implements OnInit {
  @Input() accounts: Account2FA[] = []

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
    return allSelected ? 'EXPORT_ACCOUNT_MODAL.DESELECT_ALL' : 'EXPORT_ACCOUNT_MODAL.SELECT_ALL'
  }

  get headerParams() {
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
