import { Component } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { AlertController, Platform } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(platform: Platform, private alertController: AlertController, private updates: SwUpdate, private translate: TranslateService) {
    platform.ready().then(() => {
      this.subscribeToUpdates()
      this.setupTranslate()
    }).finally(() => {
      this.hideSplashScreen()
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
          const alert = await this.alertController.create({
            backdropDismiss: false,
            header: 'Atualização disponível',
            message: 'Uma nova versão da aplicação está disponível e será carregada automaticamente',
            buttons: [
              {
                text: 'Atualizar',
                handler: () => {
                  document.location.reload()
                }
              }
            ]
          })
          await alert.present()
          break;
        case 'VERSION_INSTALLATION_FAILED':
          console.info(`Failed to install new app version '${evt.version.hash}': ${evt.error}`);
          break;
      }
    })
  }

  private hideSplashScreen() {
    setTimeout(() => {
      let splash = document.getElementById('splash-container')
      if (splash != null) {
        splash.style.opacity = '0'
        setTimeout(() => {
          splash?.remove()
        }, 250);
      }
    }, 500);
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
