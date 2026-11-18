import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Account2FA } from 'src/app/models/account2FA.model';
import { OtpService } from 'src/app/services/otp.service';
import { AccountDetailComponent } from './account-detail.component';

const SECRET = 'JBSWY3DPEHPK3PXP'

describe('AccountDetailComponent', () => {
  let component: AccountDetailComponent

  beforeEach(() => {
    component = new AccountDetailComponent(new OtpService(), {} as ToastController, {} as TranslateService)
  })

  it('shows a code with the number of digits of the account', () => {
    component.account = new Account2FA('id', 'john', SECRET, 8, 30, 'SHA256', undefined, true)

    expect(component.token.replace(/\s/g, '')).toMatch(/^\d{8}$/)
  })

  it('shows dashes instead of a code when the code cannot be generated', () => {
    component.account = new Account2FA('id', 'john', SECRET, 6, 30, 'MD5', undefined, true)

    expect(component.token.replace(/\s/g, '')).toBe('------')
  })
});
