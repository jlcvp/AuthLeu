import { Injectable } from '@angular/core'
import * as OTPAuth from 'otpauth'

@Injectable({
  providedIn: 'root'
})
export class OtpService {

  constructor() { }

  generateTOTP(secret: string, interval: number): string {
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: interval,
      secret: secret
    });
    
    return totp.generate();
  }
}
