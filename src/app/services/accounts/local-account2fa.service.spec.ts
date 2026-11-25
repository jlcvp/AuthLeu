import { Account2FA } from '../../models/account2FA.model';
import { VaultRecord } from '../../models/vault.model';
import { LocalStorageService } from '../local-storage.service';
import { LocalAccount2faService } from './local-account2fa.service';

describe('LocalAccount2faService', () => {
  const account = new Account2FA('id-1', 'john', 'JBSWY3DPEHPK3PXP', 6, 30, 'SHA1', undefined, true)

  it('fails when the accounts cannot be saved', async () => {
    const localStorage = {
      get: async () => [],
      set: async () => { throw new Error('QuotaExceededError') },
    }
    const service = new LocalAccount2faService(localStorage as unknown as LocalStorageService)

    await expectAsync(service.updateAccountsBatch([account], true)).toBeRejectedWithError('QuotaExceededError')
  })

  it('has saved the accounts when it resolves', async () => {
    const saved: unknown[] = []
    const localStorage = {
      get: async () => [],
      set: async (_key: string, value: unknown) => { saved.push(value) },
    }
    const service = new LocalAccount2faService(localStorage as unknown as LocalStorageService)

    await service.updateAccountsBatch([account], true)

    expect(saved).toEqual([[account]])
  })

  describe('vault record', () => {
    const record = (keyId: string) => ({ version: 1, keyId, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: '00' }, wrappedKey: '00', iv: '00' }) as VaultRecord
    let service: LocalAccount2faService

    beforeEach(() => {
      const stored = new Map<string, unknown>()
      const localStorage = {
        get: async (key: string) => stored.get(key),
        set: async (key: string, value: unknown) => { stored.set(key, value) },
        remove: async (key: string) => { stored.delete(key) },
      }
      service = new LocalAccount2faService(localStorage as unknown as LocalStorageService)
    })

    it('creates a record only when there is none', async () => {
      expect(await service.getVaultRecord()).toBeUndefined()

      expect(await service.createVaultRecord(record('first'))).toEqual(record('first'))
      expect(await service.createVaultRecord(record('second'))).toEqual(record('first'))
      expect(await service.getVaultRecord()).toEqual(record('first'))
    })

    it('updates and deletes the record', async () => {
      await service.createVaultRecord(record('first'))

      await service.updateVaultRecord(record('updated'))
      expect(await service.getVaultRecord()).toEqual(record('updated'))

      await service.deleteVaultRecord()
      expect(await service.getVaultRecord()).toBeUndefined()
    })
  })
});
