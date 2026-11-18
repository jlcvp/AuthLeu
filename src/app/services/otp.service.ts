import { Injectable } from '@angular/core'
import * as OTPAuth from 'otpauth'
import { IAccount2FA } from '../models/account2FA.model'

@Injectable({
  providedIn: 'root'
})
export class OtpService {

  constructor() { }

  /**
   * Generates the current TOTP code of an account, using its algorithm, number of digits and period.
   * @throws {TypeError} If the account's algorithm is not supported.
   */
  generateTOTP(account: Pick<IAccount2FA, 'secret' | 'algorithm' | 'tokenLength' | 'interval'>): string {
    const totp = new OTPAuth.TOTP({
      algorithm: account.algorithm,
      digits: account.tokenLength,
      period: account.interval,
      secret: account.secret
    });

    return totp.generate();
  }
}
