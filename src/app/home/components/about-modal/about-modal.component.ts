import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Config, ModalController } from '@ionic/angular';
import { lastValueFrom } from 'rxjs';
import { AppVersionInfo } from 'src/app/models/app-version.enum';
import { AppConfigService } from 'src/app/services/app-config.service';

@Component({
  selector: 'app-about-modal',
  templateUrl: './about-modal.component.html',
  styleUrls: ['./about-modal.component.scss'],
})
export class AboutModalComponent {

  isMD: boolean
  versionInfo: AppVersionInfo
  licenses: {title: string, body: string}[] = []

  constructor(
    private modalController: ModalController,
    private httpClient: HttpClient,
    configService: AppConfigService, 
    config: Config) {
    this.isMD = config.get('mode') !== 'ios'
    this.versionInfo = configService.versionInfo
    this.loadLicenses()
  }

  async dismissModal() {
    await this.modalController.dismiss()
  }

  private async loadLicenses() {
    const ngxscannerqrcodeLicense = await lastValueFrom(this.httpClient.get('assets/licenses/ngxqrcode.txt', {responseType: 'text'}))
    this.licenses.push({title: 'ngx-scanner-qrcode', body: ngxscannerqrcodeLicense})
  }
}
