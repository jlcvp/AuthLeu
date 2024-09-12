import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HomePage } from './home.page';

import { HomePageRoutingModule } from './home-routing.module';
import { AccountFilterPipe } from '../pipes/account-filter.pipe';
import { NgxScannerQrcodeModule } from 'ngx-scanner-qrcode';
import { AccountListComponent } from '../components/account-list/account-list.component';
import { AccountDetailComponent } from '../components/account-detail/account-detail.component';
import { CountdownTimerComponent } from '../components/countdown-timer/countdown-timer.component';
import { TranslateModule } from '@ngx-translate/core';
import { ExportAccountsModalComponent } from '../components/export-accounts-modal/export-accounts-modal.component';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    HomePageRoutingModule,
    AccountFilterPipe,
    NgxScannerQrcodeModule,
    TranslateModule.forChild()
  ],
  declarations: [HomePage, AccountListComponent, AccountDetailComponent, CountdownTimerComponent, ExportAccountsModalComponent]
})
export class HomePageModule {}
