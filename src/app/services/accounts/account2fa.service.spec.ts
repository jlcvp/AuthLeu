import { BehaviorSubject, firstValueFrom, Observable, Subject } from 'rxjs'
import { Account2FA, IAccount2FAProvider } from '../../models/account2FA.model'
import { ENCRYPTION_OPTIONS_PASSWORD_KEY } from '../../models/encryption-options.model'
import { VaultRecord } from '../../models/vault.model'
import { AppConfigService } from '../app-config.service'
import { LocalStorageService } from '../local-storage.service'
import { LogoService } from '../logo.service'
import { VaultService } from '../vault.service'
import { Account2faService } from './account2fa.service'
import { LocalAccount2faService } from './local-account2fa.service'
import { RemoteAccount2faService } from './remote-account2fa.service'

const SECRET = 'JBSWY3DPEHPK3PXP'
const PASSWORD = 'correct horse battery staple'

/** Keeps the accounts and the vault record in memory, as a provider stores them */
class FakeProvider implements IAccount2FAProvider {
  accounts$ = new BehaviorSubject<Account2FA[]>([])
  record?: VaultRecord
  private nextId = 1

  get accounts(): Account2FA[] {
    return this.accounts$.value
  }

  async getAccounts(): Promise<Observable<Account2FA[]>> {
    return this.accounts$
  }

  async addAccount(account: Account2FA): Promise<string> {
    account.id = `id-${this.nextId++}`
    this.accounts$.next([...this.accounts, account])
    return account.id
  }

  async updateAccount(account: Account2FA): Promise<void> {
    return this.updateAccountsBatch([account])
  }

  async updateAccountsBatch(accounts: Account2FA[]): Promise<void> {
    this.accounts$.next(this.accounts.map(stored => accounts.find(account => account.id === stored.id) ?? stored))
  }

  async getVaultRecord(): Promise<VaultRecord | undefined> {
    return this.record
  }

  async createVaultRecord(record: VaultRecord): Promise<VaultRecord> {
    this.record ??= record
    return this.record
  }

  async updateVaultRecord(record: VaultRecord): Promise<void> {
    this.record = record
  }

  async deleteVaultRecord(): Promise<void> {
    this.record = undefined
  }
}

describe('Account2faService', () => {
  let localStorage: LocalStorageService
  let appConfig: AppConfigService
  let vault: VaultService
  let provider: FakeProvider
  let service: Account2faService

  function plaintextAccount(id = 'id-1'): Account2FA {
    return new Account2FA(id, 'ACME:john', SECRET, 6, 30, 'SHA1', 'ACME', true)
  }

  /** An account encrypted by 2.x, with a key derived from the password */
  async function legacyAccount(id = 'id-1', password = PASSWORD): Promise<Account2FA> {
    const account = plaintextAccount(id)
    await account.lock(password)
    return account
  }

  function createVault(): VaultService {
    const vaultService = new VaultService(localStorage, appConfig)
    vaultService.kdfIterations = 1000 // keeps the tests fast
    return vaultService
  }

  /** Waits for the asynchronous decryption of emitted accounts */
  async function until(condition: () => boolean) {
    for (let i = 0; i < 100 && !condition(); i++) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  beforeEach(async () => {
    const stored = new Map<string, unknown>([['isOfflineMode', true]])
    localStorage = {
      get: async (key: string) => stored.get(key),
      set: async (key: string, value: unknown) => { stored.set(key, value) },
      remove: async (key: string) => { stored.delete(key) },
    } as unknown as LocalStorageService
    appConfig = new AppConfigService(localStorage)
    vault = createVault()
    provider = new FakeProvider()
    service = new Account2faService(
      appConfig,
      {} as LogoService,
      {} as RemoteAccount2faService,
      provider as unknown as LocalAccount2faService,
      vault,
    )
    await new Promise(resolve => setTimeout(resolve)) // let the service select its provider
  })

  describe('addAccount', () => {
    it('stores a copy encrypted with the data key while encryption is set up', async () => {
      await service.enableEncryption(PASSWORD)
      const account = plaintextAccount('')

      const id = await service.addAccount(account)

      const [stored] = provider.accounts
      expect(stored).not.toBe(account)
      expect(stored.secret).toBe('')
      expect(stored.keyId).toBe(vault.dataKey!.keyId)
      // the given account stays usable and gets the new id
      expect(account.secret).toBe(SECRET)
      expect(account.id).toBe(id)
    })

    it('stores the plaintext secret while encryption is not set up', async () => {
      await service.addAccount(plaintextAccount(''))

      expect(provider.accounts[0].secret).toBe(SECRET)
      expect(provider.accounts[0].isEncrypted).toBeFalse()
    })

    it('refuses to store a plaintext secret while encryption is set up but locked', async () => {
      await service.enableEncryption(PASSWORD)
      service.lock()

      await expectAsync(service.addAccount(plaintextAccount(''))).toBeRejectedWithError('VAULT.LOCKED')
      expect(provider.accounts).toEqual([])
    })
  })

  describe('importAccounts', () => {
    it('stores encrypted copies while encryption is set up', async () => {
      await service.enableEncryption(PASSWORD)

      await service.importAccounts([plaintextAccount('')])

      expect(provider.accounts[0].keyId).toBe(vault.dataKey!.keyId)
    })
  })

  describe('updateAccountsBatch', () => {
    it('encrypts the accounts decrypted for display', async () => {
      await service.enableEncryption(PASSWORD)
      await service.addAccount(plaintextAccount(''))
      const [displayed] = await firstValueFrom(await service.getAccounts())
      displayed.logo = 'data:image/png;base64,'

      await service.updateAccountsBatch([displayed])

      expect(provider.accounts[0].secret).toBe('')
      expect(provider.accounts[0].keyId).toBe(vault.dataKey!.keyId)
      expect(provider.accounts[0].logo).toBe('data:image/png;base64,')
      expect(displayed.secret).toBe(SECRET)
    })
  })

  describe('updateAccount', () => {
    it('never stores a plaintext secret next to its encrypted form', async () => {
      const account = await legacyAccount()
      provider.accounts$.next([account.copy()])
      account.secret = SECRET

      await service.updateAccount(account)

      expect(provider.accounts[0].secret).toBe('')
      expect(provider.accounts[0].encryptedSecret).toBe(account.encryptedSecret)
    })
  })

  describe('getAccounts', () => {
    it('decrypts copies of the accounts, leaving the stored ones encrypted', async () => {
      await service.enableEncryption(PASSWORD)
      await service.addAccount(plaintextAccount(''))

      const [displayed] = await firstValueFrom(await service.getAccounts())

      expect(displayed.secret).toBe(SECRET)
      expect(provider.accounts[0].secret).toBe('')
      expect(provider.accounts[0].encryptedSecret).toBeDefined()
    })

    it('emits locked accounts when the data key is locked, and decrypted ones once unlocked', async () => {
      await service.enableEncryption(PASSWORD)
      await service.addAccount(plaintextAccount(''))
      let displayed: Account2FA[] = []
      const subscription = (await service.getAccounts()).subscribe(accounts => displayed = accounts)
      await until(() => displayed[0]?.secret === SECRET)

      service.lock()
      await until(() => displayed[0]?.secret === '')
      expect(displayed[0].isLocked).toBeTrue()

      await service.unlock(PASSWORD)
      await until(() => displayed[0]?.secret === SECRET)
      expect(displayed[0].secret).toBe(SECRET)
      subscription.unsubscribe()
    })

    it('emits only the latest accounts when decrypting older ones takes longer', async () => {
      await service.enableEncryption(PASSWORD)
      const accounts$ = new Subject<Account2FA[]>()
      spyOn(provider, 'getAccounts').and.resolveTo(accounts$)
      const older = plaintextAccount('older')
      await older.lockWithDataKey(vault.dataKey!) // takes a decryption, unlike the newer plaintext one
      const emitted: string[][] = []
      const subscription = (await service.getAccounts()).subscribe(accounts => emitted.push(accounts.map(account => account.id)))

      accounts$.next([older])
      accounts$.next([plaintextAccount('newer')])
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(emitted).toEqual([['newer']])
      subscription.unsubscribe()
    })

    it('decrypts the accounts encrypted by 2.x with the password it stored, until the migration replaces it', async () => {
      await localStorage.set(ENCRYPTION_OPTIONS_PASSWORD_KEY, PASSWORD)
      provider.accounts$.next([await legacyAccount()])

      const [displayed] = await firstValueFrom(await service.getAccounts())

      expect(displayed.secret).toBe(SECRET)
      expect(provider.accounts[0].isLegacyEncrypted).toBeTrue()
    })

    it('leaves the accounts encrypted by 2.x locked', async () => {
      await service.enableEncryption(PASSWORD)
      provider.accounts$.next([await legacyAccount()])

      const [displayed] = await firstValueFrom(await service.getAccounts())

      expect(displayed.isLocked).toBeTrue()
    })
  })

  describe('enableEncryption', () => {
    it('creates a data key and encrypts the plaintext secrets with it', async () => {
      provider.accounts$.next([plaintextAccount('id-1'), plaintextAccount('id-2')])

      await service.enableEncryption(PASSWORD)

      expect(provider.record?.keyId).toBe(vault.dataKey!.keyId)
      expect(provider.accounts.every(account => account.keyId === provider.record?.keyId && account.secret === '')).toBeTrue()
      expect(await service.verifyPassword(PASSWORD)).toBeTrue()
    })

    it('uses the data key another device set up with the same password', async () => {
      const otherRecord = await createVault().create(PASSWORD)
      provider.record = otherRecord

      await service.enableEncryption(PASSWORD)

      expect(provider.record).toBe(otherRecord)
      expect(vault.dataKey!.keyId).toBe(otherRecord.keyId)
    })

    it('stays locked when another device set up encryption with another password', async () => {
      const otherRecord = await createVault().create('other password')
      provider.record = otherRecord
      vault.lock()

      await expectAsync(service.enableEncryption(PASSWORD)).toBeRejectedWithError('VAULT.INVALID_PASSWORD')

      expect(provider.record).toBe(otherRecord)
      expect(vault.dataKey).toBeUndefined()
    })

    it('removes its data key when the secrets cannot be encrypted, keeping encryption off', async () => {
      provider.accounts$.next([plaintextAccount()])
      spyOn(provider, 'updateAccountsBatch').and.rejectWith(new Error('offline'))

      await expectAsync(service.enableEncryption(PASSWORD)).toBeRejectedWithError('offline')

      expect(provider.record).toBeUndefined()
      expect(vault.dataKey).toBeUndefined()
      expect(provider.accounts[0].secret).toBe(SECRET)
    })
  })

  describe('disableEncryption', () => {
    it('saves every secret in plaintext and deletes the data key', async () => {
      await service.enableEncryption(PASSWORD)
      await service.addAccount(plaintextAccount(''))
      provider.accounts$.next([...provider.accounts, await legacyAccount('legacy')])

      await service.disableEncryption(PASSWORD)

      expect(provider.accounts.map(account => account.secret)).toEqual([SECRET, SECRET])
      expect(provider.accounts.some(account => account.isEncrypted)).toBeFalse()
      expect(provider.record).toBeUndefined()
      expect(vault.dataKey).toBeUndefined()
    })

    it('changes nothing with the wrong password', async () => {
      await service.enableEncryption(PASSWORD)
      await service.addAccount(plaintextAccount(''))

      await expectAsync(service.disableEncryption('wrong password')).toBeRejectedWithError('VAULT.INVALID_PASSWORD')

      expect(provider.record).toBeDefined()
      expect(provider.accounts[0].secret).toBe('')
    })
  })

  describe('upgradeLegacyAccounts', () => {
    it('re-encrypts the secrets 2.x encrypted, with the data key', async () => {
      await service.enableEncryption(PASSWORD)
      provider.accounts$.next([await legacyAccount()])

      await service.upgradeLegacyAccounts(PASSWORD)

      expect(provider.accounts[0].salt).toBeUndefined()
      expect(provider.accounts[0].keyId).toBe(vault.dataKey!.keyId)
      const [displayed] = await firstValueFrom(await service.getAccounts())
      expect(displayed.secret).toBe(SECRET)
    })

    it('saves nothing when the password does not decrypt them', async () => {
      await service.enableEncryption(PASSWORD)
      provider.accounts$.next([await legacyAccount('id-1', 'other password')])

      await expectAsync(service.upgradeLegacyAccounts(PASSWORD)).toBeRejectedWithError('CRYPTO.INVALID_DECRYPTION_KEY')

      expect(provider.accounts[0].isLegacyEncrypted).toBeTrue()
    })
  })

  describe('changePassword', () => {
    it('protects the same data key with the new password', async () => {
      await service.enableEncryption(PASSWORD)
      const keyId = provider.record!.keyId

      await service.changePassword(PASSWORD, 'new password')

      expect(provider.record!.keyId).toBe(keyId)
      expect(await service.verifyPassword('new password')).toBeTrue()
      expect(await service.verifyPassword(PASSWORD)).toBeFalse()
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
      const accounts = await service.readAccountsFromFile(backup([await legacyAccount()]))

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
