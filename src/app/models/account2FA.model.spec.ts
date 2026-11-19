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
    })

    describe('fromDictionary', () => {
        it('normalizes digits and period stored as strings, and the algorithm case', () => {
            const account = Account2FA.fromDictionary({ label: 'john', secret: SECRET, active: true, tokenLength: '8', interval: '60', algorithm: 'sha256' })

            expect(account.tokenLength).toBe(8)
            expect(account.interval).toBe(60)
            expect(account.algorithm).toBe('SHA256')
        })
    })
})
