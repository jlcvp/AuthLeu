import { AlertController, LoadingController, ModalController, NavController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';
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
  let syncError$: BehaviorSubject<unknown>
  let toastController: jasmine.SpyObj<ToastController>
  let page: HomePage

  beforeEach(() => {
    syncError$ = new BehaviorSubject<unknown>(undefined)
    accountsService = jasmine.createSpyObj<Account2faService>('Account2faService', ['clearCache', 'enableEncryption', 'disableEncryption'], { syncError$ })
    authService = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['logout'])
    storageService = jasmine.createSpyObj<LocalStorageService>('LocalStorageService', ['clearStorage'])
    configService = jasmine.createSpyObj<AppConfigService>('AppConfigService', ['setEncryptionOptions'], { versionInfo: undefined })
    configService.setEncryptionOptions.and.resolveTo()
    passwordService = jasmine.createSpyObj<PasswordService>('PasswordService', ['setupNewPassword', 'promptUnlockPassword'])

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
    toastController = jasmine.createSpyObj<ToastController>('ToastController', ['create'])
    toastController.create.and.resolveTo({ present: async () => undefined } as HTMLIonToastElement)

    page = new HomePage(
      authService,
      accountsService,
      loadingController as unknown as LoadingController,
      toastController,
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
    beforeEach(() => {
      page['encryptionOptions'] = { encryptionActive: false, shouldPerformPeriodicCheck: false }
    })

    it('turns encryption on with the new password', async () => {
      passwordService.setupNewPassword.and.resolveTo('secret')
      accountsService.enableEncryption.and.resolveTo()

      await page.encryptionActiveToggle()

      expect(accountsService.enableEncryption).toHaveBeenCalledWith('secret')
      expect(page.isEncryptionActive).toBeTrue()
      expect(configService.setEncryptionOptions).toHaveBeenCalled()
    })

    it('keeps encryption off and tells the user when encrypting fails', async () => {
      passwordService.setupNewPassword.and.resolveTo('secret')
      accountsService.enableEncryption.and.rejectWith(new Error('offline'))

      await page.encryptionActiveToggle()

      expect(page.isEncryptionActive).toBeFalse()
      expect(configService.setEncryptionOptions).not.toHaveBeenCalled()
      expect(alerts).toEqual(['HOME.ERRORS.ENCRYPTION_FAILED'])
    })

    it('tells the user when another device set up encryption with another password', async () => {
      passwordService.setupNewPassword.and.resolveTo('secret')
      accountsService.enableEncryption.and.rejectWith(new Error('VAULT.INVALID_PASSWORD'))

      await page.encryptionActiveToggle()

      expect(page.isEncryptionActive).toBeFalse()
      expect(alerts).toEqual(['HOME.ERRORS.ENCRYPTION_SET_UP_ELSEWHERE'])
    })

    it('asks for the password before turning encryption off', async () => {
      page['encryptionOptions'] = { encryptionActive: true, shouldPerformPeriodicCheck: true }
      passwordService.promptUnlockPassword.and.resolveTo('secret')
      accountsService.disableEncryption.and.resolveTo()

      await page.encryptionActiveToggle()

      expect(accountsService.disableEncryption).toHaveBeenCalledWith('secret')
      expect(page.isEncryptionActive).toBeFalse()
    })

    it('keeps encryption on when the password prompt is cancelled', async () => {
      page['encryptionOptions'] = { encryptionActive: true, shouldPerformPeriodicCheck: true }
      passwordService.promptUnlockPassword.and.resolveTo('')

      await page.encryptionActiveToggle()

      expect(accountsService.disableEncryption).not.toHaveBeenCalled()
      expect(page.isEncryptionActive).toBeTrue()
    })

    it('keeps encryption on and tells the user when the password is wrong', async () => {
      page['encryptionOptions'] = { encryptionActive: true, shouldPerformPeriodicCheck: true }
      passwordService.promptUnlockPassword.and.resolveTo('wrong password')
      accountsService.disableEncryption.and.rejectWith(new Error('VAULT.INVALID_PASSWORD'))

      await page.encryptionActiveToggle()

      expect(page.isEncryptionActive).toBeTrue()
      expect(alerts).toEqual(['HOME.ERRORS.INVALID_PASSWORD'])
    })

    it('keeps encryption on and tells the user when decrypting fails', async () => {
      page['encryptionOptions'] = { encryptionActive: true, shouldPerformPeriodicCheck: true }
      passwordService.promptUnlockPassword.and.resolveTo('secret')
      accountsService.disableEncryption.and.rejectWith(new Error('offline'))

      await page.encryptionActiveToggle()

      expect(page.isEncryptionActive).toBeTrue()
      expect(alerts).toEqual(['HOME.ERRORS.DECRYPTION_FAILED'])
    })
  })

  describe('sync errors', () => {
    it('tells the user once each time syncing starts failing', async () => {
      page['watchSyncErrors']()

      syncError$.next(new Error('permission-denied'))
      syncError$.next(new Error('permission-denied')) // a retry fails too
      syncError$.next(undefined) // synced again
      syncError$.next(new Error('permission-denied'))
      await new Promise(resolve => setTimeout(resolve)) // the toasts are created asynchronously

      expect(toastController.create).toHaveBeenCalledTimes(2)
      expect(toastController.create.calls.mostRecent().args[0]?.message).toBe('HOME.ERRORS.SYNC_FAILED')
    })
  })
});
