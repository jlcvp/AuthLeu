import { Account2FA } from '../../models/account2FA.model';
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
});
