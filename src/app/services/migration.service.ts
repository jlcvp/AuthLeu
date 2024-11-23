import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { LocalStorageService } from './local-storage.service';
import { AppVersion } from '../models/app-version.enum';
import { VersionUtils } from '../utils/version-utils';
import { AppConfigService } from './app-config.service';
import { EncryptionOptions } from '../models/encryption-options.model';
import { Account2faService } from './accounts/account2fa.service';
import { firstValueFrom } from 'rxjs';
import { LogoService } from './logo.service';
import { GlobalUtils } from '../utils/global-utils';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})

export class MigrationService {
  constructor(private localStorage: LocalStorageService, 
    private appConfigService: AppConfigService,
    private accounts2FAService: Account2faService,
    private logoService: LogoService,
    private translate: TranslateService) { }

  async migrate() {
    const dataVersion = await this.localStorage.get<string>('data_version') ?? '0.0.0'
    console.log('Current version:', dataVersion)
    
    const appVersion = environment.versionConfig.versionNumber
    console.log('App version:', appVersion )
    const migrationsToRun = Object.values(AppVersion)
      .filter(version => { 
        console.log('Checking version:', {version, dataVersion, appVersion})
        return version > dataVersion && version <= appVersion && version != AppVersion.UNKNOWN
      })
      .map(versionString => { 
        const versionMapped = VersionUtils.appVersionFromVersionString(versionString) 
        console.log('Mapped version:', versionMapped)
        return versionMapped
      })
      .sort(VersionUtils.appVersionCompare)

    if (migrationsToRun.length === 0) {
      console.log('No migrations to run.')
      return
    }

    console.log('Running migrations:', migrationsToRun)
    const message = await firstValueFrom(this.translate.get('MIGRATION.RUNNING_UPDATE'))
    GlobalUtils.updateSplashScreenMessage(message)
    for(const version of migrationsToRun) {
      await this.runMigration(version)
    }
  }

  private async runMigration(version: AppVersion) {
    switch(version) {
      case AppVersion.V1_0_0:
        await this.migrateToV1_0_0()
        await this.localStorage.set('data_version', AppVersion.V1_0_0)
        break
      case AppVersion.V2_0_0:
        await this.migrateToV2_0_0()
        await this.localStorage.set('data_version', AppVersion.V2_0_0)
        break
      case AppVersion.V2_1_0:
        await this.migrateToV2_1_0()
        await this.localStorage.set('data_version', AppVersion.V2_1_0)
        break
      case AppVersion.V2_2_0:
        await this.migrateToV2_2_0()
        await this.localStorage.set('data_version', AppVersion.V2_2_0)
        break
      default:
        console.warn('Migration not implemented for version:', version)
    }
  }

  private async migrateToV1_0_0() {
    console.log('Migrating to v1.0.0')
  }

  private async migrateToV2_0_0() {
    console.log('Migrating to v2.0.0')

    // Initial encryption options
    const encryptionOptions: EncryptionOptions = {
      encryptionActive: false,
      shouldPerformPeriodicCheck: false
    }
    await this.appConfigService.setEncryptionOptions(encryptionOptions)
    await this.appConfigService.setLastPasswordCheck(0)

    await this.appConfigService.setFirstRun() // reset first run
  }

  private async migrateToV2_1_0() {
    console.log('Migrating to v2.1.0')

    // remove 'shouldAlertToActivateEncryption' from encryption options
    const encryptionOptions = await this.appConfigService.getEncryptionOptions()
    await this.appConfigService.setEncryptionOptions({
      encryptionActive: encryptionOptions.encryptionActive,
      shouldPerformPeriodicCheck: encryptionOptions.shouldPerformPeriodicCheck
    })
  }

  private async migrateToV2_2_0() {
    console.log('Migrating to v2.2.0')

    // Convert all existing logo urls to base64 for better offline behavior
    const accounts$ = await this.accounts2FAService.getAccounts()
    
    // let the accounts settle for 1000ms
    await new Promise(resolve => setTimeout(resolve, 1000))

    const accounts = await firstValueFrom(accounts$)
    const promises: Promise<void>[] = []
    for(const account of accounts) {
      if(account.logo && account.logo.startsWith('http')) {
        const logo = account.logo
        const p = new Promise<void>(async (resolve) => {
          try {
            account.logo = await this.logoService.downloadImageAsBase64(logo)
          } catch (error) {
            console.warn('Error downloading logo (Using original URL instead)', error)
          }
          resolve()
        })
        promises.push(p)
      }
    }

    if(promises.length > 0) {
      await Promise.all(promises)
      await this.accounts2FAService.updateAccountsBatch(accounts)
    }
  }
}
