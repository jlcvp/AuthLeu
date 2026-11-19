import { of } from 'rxjs'
import { TranslateService } from '@ngx-translate/core'
import { Account2FA, IAccount2FAProvider } from '../../models/account2FA.model'
import { AppConfigService } from '../app-config.service'
import { LogoService } from '../logo.service'
import { Account2faService } from './account2fa.service'
import { LocalAccount2faService } from './local-account2fa.service'
import { RemoteAccount2faService } from './remote-account2fa.service'

const SECRET = 'JBSWY3DPEHPK3PXP'
const KEY = 'correct horse battery staple'

describe('Account2faService', () => {
  let provider: jasmine.SpyObj<IAccount2FAProvider>
  let encryptionActive: boolean
  let service: Account2faService

  function plaintextAccount(id = 'id-1'): Account2FA {
    return new Account2FA(id, 'ACME:john', SECRET, 6, 30, 'SHA1', 'ACME', true)
  }

  async function encryptedAccount(id = 'id-1'): Promise<Account2FA> {
    const account = plaintextAccount(id)
    await account.lock(KEY)
    return account
  }

  beforeEach(async () => {
    encryptionActive = true
    provider = jasmine.createSpyObj<IAccount2FAProvider>('provider', ['getAccounts', 'addAccount', 'updateAccount', 'updateAccountsBatch'])
    provider.addAccount.and.resolveTo('new-id')
    provider.updateAccount.and.resolveTo()
    provider.updateAccountsBatch.and.resolveTo()

    const appConfig = {
      isOfflineMode: async () => true,
      getEncryptionOptions: async () => ({ encryptionActive, shouldPerformPeriodicCheck: false }),
      getEncryptionKey: async () => KEY,
    }
    service = new Account2faService(
      appConfig as unknown as AppConfigService,
      {} as LogoService,
      {} as RemoteAccount2faService,
      provider as unknown as LocalAccount2faService,
      {} as TranslateService,
    )
    await new Promise(resolve => setTimeout(resolve)) // let the service select its provider
  })

  describe('addAccount', () => {
    it('stores an encrypted copy while encryption is active', async () => {
      const account = plaintextAccount('')

      const id = await service.addAccount(account)

      const stored = provider.addAccount.calls.mostRecent().args[0]
      expect(stored).not.toBe(account)
      expect(stored.secret).toBe('')
      expect(stored.isEncrypted).toBeTrue()
      await stored.unlock(KEY)
      expect(stored.secret).toBe(SECRET)
      // the given account stays usable and gets the new id
      expect(account.secret).toBe(SECRET)
      expect(id).toBe('new-id')
      expect(account.id).toBe('new-id')
    })

    it('stores the plaintext secret while encryption is inactive', async () => {
      encryptionActive = false

      await service.addAccount(plaintextAccount(''))

      const stored = provider.addAccount.calls.mostRecent().args[0]
      expect(stored.secret).toBe(SECRET)
      expect(stored.isEncrypted).toBeFalse()
    })
  })

  describe('importAccounts', () => {
    it('stores encrypted copies while encryption is active', async () => {
      await service.importAccounts([plaintextAccount('')])

      const stored = provider.addAccount.calls.mostRecent().args[0]
      expect(stored.secret).toBe('')
      expect(stored.isEncrypted).toBeTrue()
    })
  })

  describe('updateAccountsBatch', () => {
    it('encrypts accounts that were decrypted for display', async () => {
      // getAccounts() decrypts in place, and unlock() drops the encrypted fields
      const account = await encryptedAccount()
      await account.unlock(KEY)
      expect(account.isEncrypted).toBeFalse()

      await service.updateAccountsBatch([account])

      const [stored] = provider.updateAccountsBatch.calls.mostRecent().args[0]
      expect(stored.secret).toBe('')
      expect(stored.isEncrypted).toBeTrue()
      expect(account.secret).toBe(SECRET)
    })
  })

  describe('updateAccount', () => {
    it('never stores a plaintext secret next to its encrypted form', async () => {
      encryptionActive = false
      const account = await encryptedAccount()
      account.secret = SECRET

      await service.updateAccount(account)

      const stored = provider.updateAccount.calls.mostRecent().args[0]
      expect(stored.secret).toBe('')
      expect(stored.encryptedSecret).toBe(account.encryptedSecret)
    })
  })

  describe('encryptAccounts', () => {
    it('encrypts plaintext accounts and keeps encrypted ones', async () => {
      const encrypted = await encryptedAccount('id-1')
      provider.getAccounts.and.resolveTo(of([encrypted, plaintextAccount('id-2')]))

      await service.encryptAccounts()

      const stored = provider.updateAccountsBatch.calls.mostRecent().args[0]
      expect(stored.length).toBe(2)
      expect(stored.every(account => account.isEncrypted && account.secret === '')).toBeTrue()
      expect(stored[0].encryptedSecret).toBe(encrypted.encryptedSecret)
    })

    it('does not write when every account is already encrypted', async () => {
      provider.getAccounts.and.resolveTo(of([await encryptedAccount()]))

      await service.encryptAccounts()

      expect(provider.updateAccountsBatch).not.toHaveBeenCalled()
    })
  })

  describe('decryptAccounts', () => {
    it('stores plaintext secrets while encryption is still active', async () => {
      provider.getAccounts.and.resolveTo(of([await encryptedAccount()]))

      await service.decryptAccounts()

      const [stored] = provider.updateAccountsBatch.calls.mostRecent().args[0]
      expect(stored.secret).toBe(SECRET)
      expect(stored.isEncrypted).toBeFalse()
    })
  })

  describe('readAccountsFromFile', () => {
    const backup = (accounts: unknown) => new File([JSON.stringify(accounts)], 'backup.json', { type: 'application/json' })

    it('reads backups without the active flag, normalizing the secrets', async () => {
      const accounts = await service.readAccountsFromFile(backup([{ label: 'john', secret: 'jbsw y3dp ehpk 3pxp' }]))

      expect(accounts.length).toBe(1)
      expect(accounts[0].active).toBeTrue()
      expect(accounts[0].secret).toBe(SECRET)
      expect(accounts[0].isLocked).toBeFalse()
    })

    it('reads encrypted accounts', async () => {
      const accounts = await service.readAccountsFromFile(backup([await encryptedAccount()]))

      expect(accounts[0].isEncrypted).toBeTrue()
    })

    it('rejects backups with a secret that is not base32', async () => {
      await expectAsync(service.readAccountsFromFile(backup([{ label: 'john', secret: 'ABCD1890', active: true }])))
        .toBeRejectedWithError('ACCOUNT_SYNC.ERROR.INVALID_SECRET')
    })

    it('rejects files that are not a list of accounts', async () => {
      await expectAsync(service.readAccountsFromFile(backup({ label: 'john', secret: SECRET })))
        .toBeRejectedWithError('ACCOUNT_SYNC.ERROR.CORRUPT_BACKUP_FILE')
    })
  })
})
