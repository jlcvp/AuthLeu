import { CryptoUtils } from "../utils/crypto-utils"
import { Account2FA } from "./account2FA.model"
import { DataKey } from "./vault.model"

const SECRET = 'JBSWY3DPEHPK3PXP'

describe('Account2FA', () => {
    describe('fromOTPAuthURL', () => {
        it('keeps the algorithm, digits and period of the URI', () => {
            const account = Account2FA.fromOTPAuthURL(`otpauth://totp/ACME%20Co:john@example.com?secret=${SECRET}&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60`)

            expect(account.algorithm).toBe('SHA256')
            expect(account.tokenLength).toBe(8)
            expect(account.interval).toBe(60)
            expect(account.issuer).toBe('ACME Co')
        })

        it('defaults to SHA1, 6 digits and 30 seconds', () => {
            const account = Account2FA.fromOTPAuthURL(`otpauth://totp/john@example.com?secret=${SECRET}`)

            expect(account.algorithm).toBe('SHA1')
            expect(account.tokenLength).toBe(6)
            expect(account.interval).toBe(30)
        })

        it('accepts lowercase algorithm names', () => {
            const account = Account2FA.fromOTPAuthURL(`otpauth://totp/john@example.com?secret=${SECRET}&algorithm=sha512`)

            expect(account.algorithm).toBe('SHA512')
        })

        it('rejects unsupported algorithms', () => {
            expect(() => Account2FA.fromOTPAuthURL(`otpauth://totp/john@example.com?secret=${SECRET}&algorithm=MD5`)).toThrowError('Unsupported algorithm')
        })

        it('rejects secrets that are not base32', () => {
            expect(() => Account2FA.fromOTPAuthURL('otpauth://totp/john@example.com?secret=ABCD1890')).toThrowError('Invalid secret key')
        })
    })

    describe('constructor', () => {
        it('normalizes secrets written in lowercase or split into groups', () => {
            const account = new Account2FA('id', 'john', 'jbsw y3dp-ehpk 3pxp')

            expect(account.secret).toBe(SECRET)
            expect(account.isLocked).toBeFalse()
            expect(account.hasInvalidSecret).toBeFalse()
        })
    })

    describe('hasInvalidSecret', () => {
        it('is true for a plaintext secret that is not base32', () => {
            expect(new Account2FA('id', 'john', 'ABCD1890').hasInvalidSecret).toBeTrue()
        })

        it('is false for an encrypted account', async () => {
            const account = new Account2FA('id', 'john', SECRET)
            await account.lock('password')

            expect(account.isLocked).toBeTrue()
            expect(account.hasInvalidSecret).toBeFalse()
        })
    })

    describe('fromDictionary', () => {
        it('defaults active to true, as in backups from other apps', () => {
            const account = Account2FA.fromDictionary({ label: 'john', secret: SECRET })

            expect(account.active).toBeTrue()
        })

        it('keeps active false', () => {
            expect(Account2FA.fromDictionary({ label: 'john', secret: SECRET, active: false }).active).toBeFalse()
        })
        it('normalizes digits and period stored as strings, and the algorithm case', () => {
            const account = Account2FA.fromDictionary({ label: 'john', secret: SECRET, active: true, tokenLength: '8', interval: '60', algorithm: 'sha256' })

            expect(account.tokenLength).toBe(8)
            expect(account.interval).toBe(60)
            expect(account.algorithm).toBe('SHA256')
        })
    })

    describe('data key encryption', () => {
        let dataKey: DataKey

        beforeAll(async () => {
            dataKey = (await CryptoUtils.shared.createDataKey('password', 1000)).dataKey
        })

        it('encrypts and decrypts the secret with a data key', async () => {
            const account = new Account2FA('id', 'john', SECRET)

            await account.lockWithDataKey(dataKey)
            expect(account.secret).toBe('')
            expect(account.keyId).toBe(dataKey.keyId)
            expect(account.isEncrypted).toBeTrue()
            expect(account.isLegacyEncrypted).toBeFalse()
            expect(account.isLocked).toBeTrue()

            await account.unlockWithDataKey(dataKey)
            expect(account.secret).toBe(SECRET)
            expect(account.encryptedSecret).toBeUndefined()
            expect(account.keyId).toBeUndefined()
        })

        it('rejects a secret encrypted with another data key', async () => {
            const otherKey = (await CryptoUtils.shared.createDataKey('password', 1000)).dataKey
            const account = new Account2FA('id', 'john', SECRET)
            await account.lockWithDataKey(otherKey)

            await expectAsync(account.unlockWithDataKey(dataKey)).toBeRejectedWithError('CRYPTO.WRONG_DATA_KEY')
        })

        it('replaces the 2.x encryption when encrypting with a data key', async () => {
            const account = new Account2FA('id', 'john', SECRET)
            await account.lock('password')
            expect(account.isLegacyEncrypted).toBeTrue()

            await account.unlock('password')
            await account.lockWithDataKey(dataKey)

            expect(account.salt).toBeUndefined()
            expect(account.isLegacyEncrypted).toBeFalse()
        })

        it('reads and copies data key encrypted accounts', async () => {
            const account = new Account2FA('id', 'john', SECRET)
            await account.lockWithDataKey(dataKey)

            const read = Account2FA.fromDictionary(JSON.parse(JSON.stringify(account)))
            expect(read.keyId).toBe(dataKey.keyId)
            expect(read.copy().keyId).toBe(dataKey.keyId)

            await read.unlockWithDataKey(dataKey)
            expect(read.secret).toBe(SECRET)
        })
    })
})
