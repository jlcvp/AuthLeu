import { AlertController, LoadingController, ModalController, NavController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { Account2faService } from '../services/accounts/account2fa.service';
import { AppConfigService } from '../services/app-config.service';
import { AuthenticationService } from '../services/authentication.service';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';
import { MigrationService } from '../services/migration.service';
import { HomePage } from './home.page';
import { PasswordService } from './password.service';

interface AlertOptions {
  message?: string
  buttons?: (string | { role?: string, handler?: () => void })[]
}

describe('HomePage', () => {
  let accountsService: jasmine.SpyObj<Account2faService>
  let authService: jasmine.SpyObj<AuthenticationService>
  let storageService: jasmine.SpyObj<LocalStorageService>
  let configService: jasmine.SpyObj<AppConfigService>
  let passwordService: jasmine.SpyObj<PasswordService>
  let alerts: (string | undefined)[] // messages of the alerts shown
  let page: HomePage

  beforeEach(() => {
    accountsService = jasmine.createSpyObj<Account2faService>('Account2faService', ['clearCache', 'encryptAccounts', 'decryptAccounts'])
    authService = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['logout'])
    storageService = jasmine.createSpyObj<LocalStorageService>('LocalStorageService', ['clearStorage'])
    configService = jasmine.createSpyObj<AppConfigService>('AppConfigService', ['getEncryptionKey', 'clearEncryptionKey', 'setEncryptionOptions'], { versionInfo: undefined })
    configService.clearEncryptionKey.and.resolveTo()
    configService.setEncryptionOptions.and.resolveTo()
    passwordService = jasmine.createSpyObj<PasswordService>('PasswordService', ['setupNewPassword'])

    alerts = []
    const alertController = {
      create: async (options: AlertOptions) => ({
        present: async () => {
          alerts.push(options.message)
          // confirm the sign out prompt
          const confirm = options.buttons?.find(button => typeof button !== 'string' && button.role === 'destructive')
          if (confirm && typeof confirm !== 'string') {
            confirm.handler?.()
          }
        },
        onDidDismiss: async () => ({}),
      }),
    }
    const loadingController = { create: async () => ({ present: async () => undefined, dismiss: async () => true }) }
    // signing out ends by reloading the window, which would reload the test runner: stop before that
    const navController = { navigateRoot: () => Promise.reject(new Error('stopped before reloading')) }
    const translateService = { get: (key: string) => of(key) }

    page = new HomePage(
      authService,
      accountsService,
      loadingController as unknown as LoadingController,
      {} as ToastController,
      alertController as unknown as AlertController,
      {} as ModalController,
      storageService,
      configService,
      {} as MigrationService,
      translateService as unknown as TranslateService,
      {} as LoggingService,
      passwordService,
      navController as unknown as NavController,
    )
  })

  describe('logout', () => {
    it('runs every sign out step even if one fails', async () => {
      accountsService.clearCache.and.rejectWith(new Error('Firestore cache in use by another tab'))
      authService.logout.and.resolveTo()
      storageService.clearStorage.and.resolveTo()

      await expectAsync(page.logout()).toBeRejectedWithError('stopped before reloading')

      expect(authService.logout).toHaveBeenCalled()
      expect(storageService.clearStorage).toHaveBeenCalled()
    })
  })

  describe('encryptionActiveToggle', () => {
    it('forgets the new password and tells the user when encrypting fails', async () => {
      passwordService.setupNewPassword.and.resolveTo(true)
      accountsService.encryptAccounts.and.rejectWith(new Error('offline'))

      await page.encryptionActiveToggle()

      expect(configService.clearEncryptionKey).toHaveBeenCalled()
      expect(configService.setEncryptionOptions).not.toHaveBeenCalled()
      expect(page.isEncryptionActive).toBeFalse()
      expect(alerts).toEqual(['HOME.ERRORS.ENCRYPTION_FAILED'])
    })

    it('keeps encryption on and tells the user when decrypting fails', async () => {
      page['encryptionOptions'] = { encryptionActive: true, shouldPerformPeriodicCheck: true }
      configService.getEncryptionKey.and.resolveTo('password')
      accountsService.decryptAccounts.and.rejectWith(new Error('wrong password'))

      await page.encryptionActiveToggle()

      expect(configService.clearEncryptionKey).not.toHaveBeenCalled()
      expect(page.isEncryptionActive).toBeTrue()
      expect(alerts).toEqual(['HOME.ERRORS.DECRYPTION_FAILED'])
    })
  })
});
