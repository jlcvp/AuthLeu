import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HomePage } from './home.page';

import { HomePageRoutingModule } from './home-routing.module';
import { AccountFilterPipe } from '../pipes/account-filter.pipe';
import { NgxScannerQrcodeModule } from 'ngx-scanner-qrcode';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    HomePageRoutingModule,
    AccountFilterPipe,
    NgxScannerQrcodeModule
  ],
  declarations: [HomePage]
})
export class HomePageModule {}
