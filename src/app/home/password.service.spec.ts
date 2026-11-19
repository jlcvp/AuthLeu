import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AppConfigService } from '../services/app-config.service';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  // what the alert resolves with; Ionic includes the typed values even when it's cancelled
  let dismissal: { data?: unknown, role?: string }
  let configService: jasmine.SpyObj<AppConfigService>
  let service: PasswordService

  beforeEach(() => {
    const alertController = {
      create: async () => ({ present: async () => undefined, onDidDismiss: async () => dismissal }),
    }
    configService = jasmine.createSpyObj<AppConfigService>('AppConfigService', ['setEncryptionKey', 'setLastPasswordCheck'])
    configService.setEncryptionKey.and.resolveTo()
    configService.setLastPasswordCheck.and.resolveTo()
    const translateService = { get: (key: string) => of(key) }
    service = new PasswordService(alertController as unknown as AlertController, configService, translateService as unknown as TranslateService)
  })

  describe('setupNewPassword', () => {
    it('does not set a password when the prompt is cancelled', async () => {
      dismissal = { data: { values: { password: 'secret', passwordConfirmation: 'secret' } }, role: 'cancel' }

      expect(await service.setupNewPassword()).toBeFalse()
      expect(configService.setEncryptionKey).not.toHaveBeenCalled()
    })

    it('sets the password when it is confirmed', async () => {
      dismissal = { data: { values: { password: 'secret', passwordConfirmation: 'secret' } }, role: 'confirm' }

      expect(await service.setupNewPassword()).toBeTrue()
      expect(configService.setEncryptionKey).toHaveBeenCalledWith('secret')
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
});
