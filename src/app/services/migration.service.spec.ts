import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ENCRYPTION_OPTIONS_KEY, ENCRYPTION_OPTIONS_PASSWORD_KEY } from '../models/encryption-options.model';
import { Account2faService } from './accounts/account2fa.service';
import { AppConfigService } from './app-config.service';
import { LocalStorageService } from './local-storage.service';
import { LogoService } from './logo.service';
import { MigrationService } from './migration.service';

describe('MigrationService', () => {
  const versionNumber = environment.versionConfig.versionNumber
  let stored: Map<string, unknown>
  let accountsService: jasmine.SpyObj<Account2faService>
  let service: MigrationService

  beforeEach(() => {
    environment.versionConfig.versionNumber = '3.0.0'
    stored = new Map()
    const localStorage = {
      get: async (key: string) => stored.get(key),
      set: async (key: string, value: unknown) => { stored.set(key, value) },
      remove: async (key: string) => { stored.delete(key) },
    } as unknown as LocalStorageService
    accountsService = jasmine.createSpyObj<Account2faService>('Account2faService', ['getAccounts', 'enableEncryption', 'upgradeLegacyAccounts', 'updateAccountsBatch'])
    accountsService.getAccounts.and.resolveTo(of([]))
    accountsService.enableEncryption.and.resolveTo()
    accountsService.upgradeLegacyAccounts.and.resolveTo()
    const translateService = { get: (key: string) => of(key) } as unknown as TranslateService
    service = new MigrationService(localStorage, new AppConfigService(localStorage), accountsService, {} as LogoService, translateService)
  })

  afterEach(() => {
    environment.versionConfig.versionNumber = versionNumber
  })

  it('initializes the encryption options of new installs', async () => {
    await service.migrate()

    expect(stored.get(ENCRYPTION_OPTIONS_KEY)).toEqual({ encryptionActive: false, shouldPerformPeriodicCheck: false })
    expect(stored.get('data_version')).toBe('3.0.0')
    expect(accountsService.enableEncryption).not.toHaveBeenCalled()
  })

  it('keeps encryption on for installs without a recorded data version', async () => {
    // GitHub Pages builds before 3.0.0 never recorded a data version, so they run every migration
    stored.set(ENCRYPTION_OPTIONS_KEY, { encryptionActive: true, shouldPerformPeriodicCheck: true })
    stored.set(ENCRYPTION_OPTIONS_PASSWORD_KEY, 'password')

    await service.migrate()

    expect(stored.get(ENCRYPTION_OPTIONS_KEY)).toEqual({ encryptionActive: true, shouldPerformPeriodicCheck: true })
    expect(stored.get('data_version')).toBe('3.0.0')
    // the 3.0.0 migration replaces the stored password with a data key
    expect(accountsService.enableEncryption).toHaveBeenCalledWith('password')
    expect(accountsService.upgradeLegacyAccounts).toHaveBeenCalledWith('password')
    expect(stored.has(ENCRYPTION_OPTIONS_PASSWORD_KEY)).toBeFalse()
  })

  describe('3.0.0', () => {
    beforeEach(() => {
      stored.set('data_version', '2.2.0')
      stored.set(ENCRYPTION_OPTIONS_KEY, { encryptionActive: true, shouldPerformPeriodicCheck: true })
      stored.set(ENCRYPTION_OPTIONS_PASSWORD_KEY, 'password')
    })

    it('deletes the stored password when encryption is off', async () => {
      stored.set(ENCRYPTION_OPTIONS_KEY, { encryptionActive: false, shouldPerformPeriodicCheck: false })

      await service.migrate()

      expect(accountsService.enableEncryption).not.toHaveBeenCalled()
      expect(stored.has(ENCRYPTION_OPTIONS_PASSWORD_KEY)).toBeFalse()
      expect(stored.get('data_version')).toBe('3.0.0')
    })

    it('keeps the stored password when another device set up encryption with another password', async () => {
      accountsService.enableEncryption.and.rejectWith(new Error('VAULT.INVALID_PASSWORD'))

      await service.migrate()

      expect(accountsService.upgradeLegacyAccounts).not.toHaveBeenCalled()
      expect(stored.get(ENCRYPTION_OPTIONS_PASSWORD_KEY)).toBe('password')
      expect(stored.get('data_version')).toBe('3.0.0')
    })

    it('runs again on the next launch when the data key cannot be set up', async () => {
      accountsService.enableEncryption.and.rejectWith(new Error('offline'))

      await service.migrate()

      expect(stored.get(ENCRYPTION_OPTIONS_PASSWORD_KEY)).toBe('password')
      expect(stored.get('data_version')).toBe('2.2.0')
    })
  })

  it('runs no migrations when the data is up to date', async () => {
    stored.set('data_version', '3.0.0')

    await service.migrate()

    expect(stored.get(ENCRYPTION_OPTIONS_KEY)).toBeUndefined()
    expect(accountsService.getAccounts).not.toHaveBeenCalled()
  })
});
