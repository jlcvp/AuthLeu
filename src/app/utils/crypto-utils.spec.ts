import { VAULT_KDF_ITERATIONS } from "../models/vault.model"
import { CryptoUtils } from "./crypto-utils"

const PASSWORD = 'correct horse battery staple'
const ITERATIONS = 1000 // keeps the tests fast; the default is checked separately

describe('CryptoUtils data keys', () => {
    const crypto = CryptoUtils.shared

    it('creates a data key that unlocks with the password', async () => {
        const { record, dataKey } = await crypto.createDataKey(PASSWORD, ITERATIONS)
        const { ciphertext, iv } = await crypto.encryptWithDataKey('JBSWY3DPEHPK3PXP', dataKey.key)

        const unlocked = await crypto.unlockDataKey(record, PASSWORD)

        expect(unlocked.keyId).toBe(dataKey.keyId)
        expect(await crypto.decryptWithDataKey(ciphertext, iv, unlocked.key)).toBe('JBSWY3DPEHPK3PXP')
    })

    it('derives the wrapping key with PBKDF2-SHA256 and 600k iterations by default', async () => {
        const { record } = await crypto.createDataKey(PASSWORD)

        expect(record.version).toBe(1)
        expect(record.kdf).toEqual({ name: 'PBKDF2', hash: 'SHA-256', iterations: VAULT_KDF_ITERATIONS, salt: jasmine.stringMatching(/^[0-9a-f]{32}$/) })
        expect(record.keyId).toMatch(/^[0-9a-f]{32}$/)
    })

    it('rejects the wrong password', async () => {
        const { record } = await crypto.createDataKey(PASSWORD, ITERATIONS)

        await expectAsync(crypto.unlockDataKey(record, 'wrong password')).toBeRejectedWithError('VAULT.INVALID_PASSWORD')
    })

    it('never hands out keys that can be exported', async () => {
        const { record, dataKey } = await crypto.createDataKey(PASSWORD, ITERATIONS)
        const unlocked = await crypto.unlockDataKey(record, PASSWORD)

        expect(dataKey.key.extractable).toBeFalse()
        expect(unlocked.key.extractable).toBeFalse()
        await expectAsync(window.crypto.subtle.exportKey('raw', unlocked.key)).toBeRejected()
    })

    it('rewraps the data key with a new password, keeping the encrypted data readable', async () => {
        const { record, dataKey } = await crypto.createDataKey(PASSWORD, ITERATIONS)
        const { ciphertext, iv } = await crypto.encryptWithDataKey('JBSWY3DPEHPK3PXP', dataKey.key)

        const rewrapped = await crypto.rewrapDataKey(record, PASSWORD, 'new password', ITERATIONS)

        expect(rewrapped.keyId).toBe(record.keyId)
        expect(rewrapped.kdf.salt).not.toBe(record.kdf.salt)
        await expectAsync(crypto.unlockDataKey(rewrapped, PASSWORD)).toBeRejectedWithError('VAULT.INVALID_PASSWORD')
        const unlocked = await crypto.unlockDataKey(rewrapped, 'new password')
        expect(await crypto.decryptWithDataKey(ciphertext, iv, unlocked.key)).toBe('JBSWY3DPEHPK3PXP')
    })

    it('does not rewrap with the wrong old password', async () => {
        const { record } = await crypto.createDataKey(PASSWORD, ITERATIONS)

        await expectAsync(crypto.rewrapDataKey(record, 'wrong password', 'new password', ITERATIONS)).toBeRejectedWithError('VAULT.INVALID_PASSWORD')
    })

    it('uses a new IV for every encryption', async () => {
        const { dataKey } = await crypto.createDataKey(PASSWORD, ITERATIONS)

        const first = await crypto.encryptWithDataKey('JBSWY3DPEHPK3PXP', dataKey.key)
        const second = await crypto.encryptWithDataKey('JBSWY3DPEHPK3PXP', dataKey.key)

        expect(first.iv).not.toBe(second.iv)
        expect(first.ciphertext).not.toBe(second.ciphertext)
    })

    it('rejects records in an unknown format', async () => {
        const { record } = await crypto.createDataKey(PASSWORD, ITERATIONS)

        await expectAsync(crypto.unlockDataKey({ ...record, version: 2 as 1 }, PASSWORD)).toBeRejectedWithError('VAULT.UNSUPPORTED_FORMAT')
    })
})
