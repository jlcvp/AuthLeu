import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { Account2faService } from '../services/accounts/account2fa.service';
import { AppConfigService } from '../services/app-config.service';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  // what the alert resolves with; Ionic includes the typed values even when it's cancelled
  let dismissal: { data?: unknown, role?: string }
  let configService: jasmine.SpyObj<AppConfigService>
  let accountsService: jasmine.SpyObj<Account2faService>
  let service: PasswordService

  beforeEach(() => {
    const alertController = {
      create: async () => ({ present: async () => undefined, onDidDismiss: async () => dismissal }),
    }
    configService = jasmine.createSpyObj<AppConfigService>('AppConfigService', ['setLastPasswordCheck', 'getLastPasswordCheck'])
    configService.setLastPasswordCheck.and.resolveTo()
    configService.getLastPasswordCheck.and.resolveTo(0)
    accountsService = jasmine.createSpyObj<Account2faService>('Account2faService', ['verifyPassword'])
    const translateService = { get: (key: string) => of(key) }
    service = new PasswordService(alertController as unknown as AlertController, configService, translateService as unknown as TranslateService, accountsService)
  })

  describe('setupNewPassword', () => {
    it('returns no password when the prompt is cancelled', async () => {
      dismissal = { data: { values: { password: 'secret', passwordConfirmation: 'secret' } }, role: 'cancel' }

      expect(await service.setupNewPassword()).toBeUndefined()
    })

    it('returns no password when the passwords do not match', async () => {
      dismissal = { data: { values: { password: 'secret', passwordConfirmation: 'other' } }, role: 'confirm' }

      expect(await service.setupNewPassword()).toBeUndefined()
    })

    it('returns the password when it is confirmed', async () => {
      dismissal = { data: { values: { password: 'secret', passwordConfirmation: 'secret' } }, role: 'confirm' }

      expect(await service.setupNewPassword()).toBe('secret')
    })
  })

  describe('promptUnlockPassword', () => {
    it('returns no password when the prompt is cancelled', async () => {
      dismissal = { data: { values: { password: 'secret' } }, role: 'cancel' }

      expect(await service.promptUnlockPassword()).toBe('')
    })

    it('returns the typed password when it is confirmed', async () => {
      dismissal = { data: { values: { password: 'secret' } }, role: 'confirm' }

      expect(await service.promptUnlockPassword()).toBe('secret')
    })
  })

  describe('periodicPasswordCheck', () => {
    it('checks the password against the data key', async () => {
      dismissal = { data: { values: { password: 'secret' } }, role: 'confirm' }
      accountsService.verifyPassword.and.resolveTo(true)

      await service.periodicPasswordCheck()

      expect(accountsService.verifyPassword).toHaveBeenCalledWith('secret')
      expect(configService.setLastPasswordCheck).toHaveBeenCalled()
    })

    it('does not count a wrong password as a successful check', async () => {
      dismissal = { data: { values: { password: 'wrong' } }, role: 'confirm' }
      accountsService.verifyPassword.and.resolveTo(false)

      await service.periodicPasswordCheck()

      expect(configService.setLastPasswordCheck).not.toHaveBeenCalled()
    })
  })
});
