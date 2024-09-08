import { Component } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { AlertController, Platform } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { LoggingService } from './services/logging.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(platform: Platform, private alertController: AlertController, private updates: SwUpdate, private translate: TranslateService, logging: LoggingService) {
    logging.disableConsoleInProduction()
    platform.ready().then(() => {
      this.subscribeToUpdates()
      this.setupTranslate()
    })
  }

  private subscribeToUpdates() {
    this.updates.versionUpdates.subscribe(async (evt) => {
      switch (evt.type) {
        case 'VERSION_DETECTED':
          console.info(`Downloading new app version: ${evt.version.hash}`);
          break;
        case 'VERSION_READY':
          console.info(`Current app version: ${evt.currentVersion.hash}`);
          console.info(`New app version ready for use: ${evt.latestVersion.hash}`);
          await this.showUpdateAlert()
          break;
        case 'VERSION_INSTALLATION_FAILED':
          console.info(`Failed to install new app version '${evt.version.hash}': ${evt.error}`);
          break;
      }
    })
  }

  private async showUpdateAlert() {
    const header = await firstValueFrom(this.translate.get('UPDATER.UPDATE_AVAILABLE_HEADER'))
    const message = await firstValueFrom(this.translate.get('UPDATER.UPDATE_AVAILABLE_BODY'))
    const confirm = await firstValueFrom(this.translate.get('UPDATER.UPDATE_NOW'))
    const alert = await this.alertController.create({
      backdropDismiss: false,
      header,
      message,
      buttons: [
        {
          text: confirm,
          handler: () => {
            document.location.reload()
          }
        }
      ]
    })
    await alert.present()
  }

  private async setupTranslate() {
    this.translate.setDefaultLang('en')
    const supportedLanguages = /en|pt/
    // get the browser language
    let browserLang = this.translate.getBrowserLang()
    console.log("detected browser language: ", browserLang)
    if (browserLang !== undefined && this.translate.getBrowserLang()?.match(supportedLanguages)) {
      this.translate.use(browserLang)
    }
  }
}
