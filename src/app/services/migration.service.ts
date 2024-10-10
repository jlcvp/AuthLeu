import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { LocalStorageService } from './local-storage.service';
import { AppVersion } from '../models/app-version.enum';
import { VersionUtils } from '../utils/version-utils';
import { AppConfigService } from './app-config.service';
import { EncryptionOptions } from '../models/encryption-options.model';
import { App } from '@capacitor/app';

@Injectable({
  providedIn: 'root'
})

export class MigrationService {
  constructor(private localStorage: LocalStorageService, private appConfigService: AppConfigService) { }

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
      .map(versionString => VersionUtils.appVersionFromVersionString(versionString))
      .sort(VersionUtils.appVersionCompare)

    if (migrationsToRun.length === 0) {
      console.log('No migrations to run.')
      return
    }

    console.log('Running migrations:', migrationsToRun)
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
      default:
        console.error('Migration not implemented for version:', version)
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
}
