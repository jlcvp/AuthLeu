import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { Account2FA } from 'src/app/models/account2FA.model';
import { OtpService } from 'src/app/services/otp.service';
import { AccountDetailComponent } from './account-detail.component';

const SECRET = 'JBSWY3DPEHPK3PXP'

describe('AccountDetailComponent', () => {
  let component: AccountDetailComponent
  let writeText: jasmine.Spy

  beforeEach(() => {
    const toastController = { create: async () => ({ present: async () => undefined }) }
    const translateService = { get: (key: string) => of(key) }
    component = new AccountDetailComponent(new OtpService(), toastController as unknown as ToastController, translateService as unknown as TranslateService)
    writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo()
  })

  it('shows a code with the number of digits of the account', () => {
    component.account = new Account2FA('id', 'john', SECRET, 8, 30, 'SHA256', undefined, true)

    expect(component.token.replace(/\s/g, '')).toMatch(/^\d{8}$/)
  })

  it('copies the code', async () => {
    component.account = new Account2FA('id', 'john', SECRET, 6, 30, 'SHA1', undefined, true)

    await component.copyCode(undefined)

    expect(writeText).toHaveBeenCalledWith(component.token.replace(/\s/g, ''))
  })

  it('shows dashes instead of a code when the code cannot be generated', () => {
    component.account = new Account2FA('id', 'john', SECRET, 6, 30, 'MD5', undefined, true)

    expect(component.token.replace(/\s/g, '')).toBe('------')
  })

  it('shows dashes and copies nothing while the account is still encrypted', async () => {
    const account = new Account2FA('id', 'john', SECRET, 6, 30, 'SHA1', undefined, true)
    await account.lock('password')
    component.account = account

    await component.copyCode(undefined)

    expect(component.token.replace(/\s/g, '')).toBe('------')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('shows the code once the selected account is unlocked', async () => {
    const account = new Account2FA('id', 'john', SECRET, 6, 30, 'SHA1', undefined, true)
    await account.lock('password')
    component.account = account

    await account.unlock('password')
    component.updateCode()

    expect(component.token.replace(/\s/g, '')).toMatch(/^\d{6}$/)
  })

  describe('codeEndTime', () => {
    beforeEach(() => {
      jasmine.clock().install()
      jasmine.clock().mockDate(new Date(Date.UTC(2026, 0, 1, 0, 0, 10, 500)))
    })

    afterEach(() => {
      jasmine.clock().uninstall()
    })

    it('is when the code of the account changes', () => {
      component.account = new Account2FA('id', 'john', SECRET, 6, 30, 'SHA1', undefined, true)
      expect(component.codeEndTime).toBe(Date.UTC(2026, 0, 1, 0, 0, 30))

      component.account = new Account2FA('id', 'john', SECRET, 6, 60, 'SHA1', undefined, true)
      expect(component.codeEndTime).toBe(Date.UTC(2026, 0, 1, 0, 1, 0))
    })

    it('moves to the next code change when the timer ends', () => {
      component.account = new Account2FA('id', 'john', SECRET, 6, 30, 'SHA1', undefined, true)
      const firstToken = component.token

      jasmine.clock().mockDate(new Date(Date.UTC(2026, 0, 1, 0, 0, 30)))
      component.timerEnd()

      expect(component.codeEndTime).toBe(Date.UTC(2026, 0, 1, 0, 1, 0))
      expect(component.token).not.toBe(firstToken)
    })
  })
});
