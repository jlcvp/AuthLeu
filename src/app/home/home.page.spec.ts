import { AlertController, LoadingController, ModalController, NavController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';
import { Account2faService } from '../services/accounts/account2fa.service';
import { AppConfigService } from '../services/app-config.service';
import { AuthenticationService } from '../services/authentication.service';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';
import { MigrationService } from '../services/migration.service';
import { AutoLockService } from '../services/auto-lock.service';
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
    accountsService = jasmine.createSpyObj<Account2faService>('Account2faService', ['clearCache', 'enableEncryption', 'disableEncryption', 'verifyPassword', 'changePassword', 'setUnlockRemembered', 'lock'], { syncError$, isUnlocked: true })
    authService = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['logout'])
    storageService = jasmine.createSpyObj<LocalStorageService>('LocalStorageService', ['clearStorage'])
    configService = jasmine.createSpyObj<AppConfigService>('AppConfigService', ['setEncryptionOptions', 'getVaultOptions', 'setVaultOptions'], { versionInfo: undefined })
    configService.setEncryptionOptions.and.resolveTo()
    configService.getVaultOptions.and.resolveTo({ rememberUnlock: true, autoLockMinutes: 5 })
    configService.setVaultOptions.and.resolveTo()
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
      {} as AutoLockService,
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

  describe('unlock settings', () => {
    function setUnlocked(unlocked: boolean) {
      (Object.getOwnPropertyDescriptor(accountsService, 'isUnlocked')!.get as jasmine.Spy).and.returnValue(unlocked)
    }

    it('shows the lock screen while encryption is set up and locked', () => {
      setUnlocked(false)
      expect(page.isLocked).toBeFalse() // encryption isn't set up

      page.hasVaultRecord = true
      expect(page.isLocked).toBeTrue()

      setUnlocked(true)
      expect(page.isLocked).toBeFalse()
    })

    it('stops remembering the unlock on this device when asked for the password on open', async () => {
      accountsService.setUnlockRemembered.and.resolveTo()

      await page.askPasswordOnOpenToggle()

      expect(page.askPasswordOnOpen).toBeTrue()
      expect(accountsService.setUnlockRemembered).toHaveBeenCalledWith(false)
    })

    it('saves the auto-lock delay', async () => {
      await page.autoLockChange(15)

      expect(page.autoLockMinutes).toBe(15)
      expect(configService.setVaultOptions).toHaveBeenCalledWith({ autoLockMinutes: 15 })
    })

    it('locks now', () => {
      page.lockAction()

      expect(accountsService.lock).toHaveBeenCalled()
    })
  })

  describe('changePasswordAction', () => {
    it('changes the password after checking the current one', async () => {
      passwordService.promptUnlockPassword.and.resolveTo('current')
      passwordService.setupNewPassword.and.resolveTo('new')
      accountsService.verifyPassword.and.resolveTo(true)
      accountsService.changePassword.and.resolveTo()

      await page.changePasswordAction()

      expect(passwordService.promptUnlockPassword).toHaveBeenCalledWith('HOME.CHANGE_PASSWORD.CURRENT')
      expect(passwordService.setupNewPassword).toHaveBeenCalledWith('HOME.CHANGE_PASSWORD.NEW')
      expect(accountsService.changePassword).toHaveBeenCalledWith('current', 'new')
      expect(toastController.create).toHaveBeenCalledWith(jasmine.objectContaining({ message: 'HOME.CHANGE_PASSWORD.DONE' }))
    })

    it('does not ask for a new password when the current one is wrong', async () => {
      passwordService.promptUnlockPassword.and.resolveTo('wrong')
      accountsService.verifyPassword.and.resolveTo(false)

      await page.changePasswordAction()

      expect(passwordService.setupNewPassword).not.toHaveBeenCalled()
      expect(alerts).toEqual(['HOME.ERRORS.INVALID_PASSWORD'])
    })

    it('tells the user when the password cannot be changed', async () => {
      passwordService.promptUnlockPassword.and.resolveTo('current')
      passwordService.setupNewPassword.and.resolveTo('new')
      accountsService.verifyPassword.and.resolveTo(true)
      accountsService.changePassword.and.rejectWith(new Error('offline'))

      await page.changePasswordAction()

      expect(alerts).toEqual(['HOME.CHANGE_PASSWORD.FAILED'])
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
