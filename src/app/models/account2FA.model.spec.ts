import { Account2FA } from "./account2FA.model"

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
})
