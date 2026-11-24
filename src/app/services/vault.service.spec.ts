import { AppConfigService } from './app-config.service';
import { LocalStorageService } from './local-storage.service';
import { VaultService } from './vault.service';

const PASSWORD = 'correct horse battery staple'

describe('VaultService', () => {
  let stored: Map<string, unknown>
  let localStorage: LocalStorageService
  let service: VaultService

  /** Stores values as they are, like IndexedDB's structured cloning */
  function createStorage(serialize = false): LocalStorageService {
    return {
      get: async (key: string) => stored.get(key),
      set: async (key: string, value: unknown) => { stored.set(key, serialize ? JSON.parse(JSON.stringify(value)) : value) },
      remove: async (key: string) => { stored.delete(key) },
    } as unknown as LocalStorageService
  }

  function createService(): VaultService {
    const vault = new VaultService(localStorage, new AppConfigService(localStorage))
    vault.kdfIterations = 1000 // keeps the tests fast
    return vault
  }

  function rememberedKey() {
    return stored.get('vaultDataKey') as { keyId: string, key: unknown } | undefined
  }

  beforeEach(() => {
    stored = new Map()
    localStorage = createStorage()
    service = createService()
  })

  it('creates and unlocks a data key, remembering it on this device by default', async () => {
    const record = await service.create(PASSWORD)

    expect(service.dataKey?.keyId).toBe(record.keyId)
    expect(rememberedKey()?.keyId).toBe(record.keyId)
    expect(rememberedKey()?.key).toBeInstanceOf(CryptoKey)
    expect((rememberedKey()?.key as CryptoKey).extractable).toBeFalse()
  })

  it('restores the remembered data key on the next launch', async () => {
    const record = await service.create(PASSWORD)

    const nextLaunch = createService()
    expect(await nextLaunch.restore(record)).toBeTrue()
    expect(nextLaunch.dataKey?.keyId).toBe(record.keyId)
  })

  it('discards a remembered data key that belongs to another record', async () => {
    const record = await service.create(PASSWORD)
    await createService().create('other password') // remembers another data key in its place

    expect(await createService().restore(record)).toBeFalse()
    expect(rememberedKey()).toBeUndefined()
  })

  it('does not keep the data key on this device when asked not to', async () => {
    await service.setRemembered(false)

    const record = await service.create(PASSWORD)

    expect(service.dataKey).toBeDefined()
    expect(rememberedKey()).toBeUndefined()
    expect(await createService().restore(record)).toBeFalse()
  })

  it('stores or removes the current data key when the preference changes', async () => {
    const record = await service.create(PASSWORD)

    await service.setRemembered(false)
    expect(rememberedKey()).toBeUndefined()
    expect(service.dataKey).toBeDefined() // still unlocked

    await service.setRemembered(true)
    expect(rememberedKey()?.keyId).toBe(record.keyId)
  })

  it('unlocks with the password and rejects the wrong one', async () => {
    const record = await service.create(PASSWORD)
    await service.forget()

    await expectAsync(service.unlock(record, 'wrong password')).toBeRejectedWithError('VAULT.INVALID_PASSWORD')
    expect(service.dataKey).toBeUndefined()

    await service.unlock(record, PASSWORD)
    expect(service.dataKey?.keyId).toBe(record.keyId)
  })

  it('locks by removing the data key from memory only, and forgets it from the device too', async () => {
    const record = await service.create(PASSWORD)

    service.lock()
    expect(service.dataKey).toBeUndefined()
    expect(rememberedKey()?.keyId).toBe(record.keyId)

    await service.forget()
    expect(rememberedKey()).toBeUndefined()
  })

  it('changes the password without changing the data key', async () => {
    const record = await service.create(PASSWORD)

    const newRecord = await service.changePassword(record, PASSWORD, 'new password')

    expect(newRecord.keyId).toBe(record.keyId)
    expect(await service.verifyPassword(newRecord, 'new password')).toBeTrue()
    expect(await service.verifyPassword(newRecord, PASSWORD)).toBeFalse()
    expect(service.dataKey?.keyId).toBe(record.keyId)
  })

  it('verifies a password without unlocking', async () => {
    const record = await service.create(PASSWORD)
    service.lock()

    expect(await service.verifyPassword(record, PASSWORD)).toBeTrue()
    expect(await service.verifyPassword(record, 'wrong password')).toBeFalse()
    expect(service.dataKey).toBeUndefined()
  })

  it('stays unlocked but remembers nothing when the storage cannot keep a CryptoKey', async () => {
    localStorage = createStorage(true) // like the localStorage driver, which serializes to JSON
    service = createService()

    const record = await service.create(PASSWORD)

    expect(service.dataKey?.keyId).toBe(record.keyId)
    expect(rememberedKey()).toBeUndefined()
  })
});
