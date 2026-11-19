import { OtpService } from './otp.service'

// RFC 6238, Appendix B: the ASCII seed "1234567890" repeated to 20, 32 and 64 bytes, base32-encoded
const SEEDS: Record<string, string> = {
  SHA1: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  SHA256: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA',
  SHA512: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA',
}
const VECTORS: { time: number, codes: Record<string, string> }[] = [
  { time: 59, codes: { SHA1: '94287082', SHA256: '46119246', SHA512: '90693936' } },
  { time: 1111111109, codes: { SHA1: '07081804', SHA256: '68084774', SHA512: '25091201' } },
  { time: 1234567890, codes: { SHA1: '89005924', SHA256: '91819424', SHA512: '93441116' } },
  { time: 20000000000, codes: { SHA1: '65353130', SHA256: '77737706', SHA512: '47863826' } },
]

describe('OtpService', () => {
  let service: OtpService

  beforeEach(() => {
    service = new OtpService()
    jasmine.clock().install()
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  for (const algorithm of Object.keys(SEEDS)) {
    it(`generates the RFC 6238 ${algorithm} test vectors`, () => {
      for (const { time, codes } of VECTORS) {
        jasmine.clock().mockDate(new Date(time * 1000))
        expect(service.generateTOTP({ secret: SEEDS[algorithm], algorithm, tokenLength: 8, interval: 30 })).toBe(codes[algorithm])
      }
    })
  }

  it('generates codes with the number of digits of the account', () => {
    jasmine.clock().mockDate(new Date(59 * 1000))
    expect(service.generateTOTP({ secret: SEEDS['SHA1'], algorithm: 'SHA1', tokenLength: 6, interval: 30 })).toBe('287082')
  })

  it('uses the period of the account', () => {
    // with a 60s period, t=59s is still in time step 0, like t=29s with a 30s period
    jasmine.clock().mockDate(new Date(59 * 1000))
    const code60 = service.generateTOTP({ secret: SEEDS['SHA1'], algorithm: 'SHA1', tokenLength: 8, interval: 60 })
    jasmine.clock().mockDate(new Date(29 * 1000))
    const code30 = service.generateTOTP({ secret: SEEDS['SHA1'], algorithm: 'SHA1', tokenLength: 8, interval: 30 })
    expect(code60).toBe(code30)
  })

  it('throws on unsupported algorithms', () => {
    expect(() => service.generateTOTP({ secret: SEEDS['SHA1'], algorithm: 'MD5', tokenLength: 6, interval: 30 })).toThrowError(TypeError)
  })
})
