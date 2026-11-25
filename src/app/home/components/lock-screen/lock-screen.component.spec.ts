import { Account2faService } from 'src/app/services/accounts/account2fa.service';
import { LockScreenComponent } from './lock-screen.component';

describe('LockScreenComponent', () => {
  let accountsService: jasmine.SpyObj<Account2faService>
  let component: LockScreenComponent
  let unlocked: number

  beforeEach(() => {
    accountsService = jasmine.createSpyObj<Account2faService>('Account2faService', ['unlock'])
    component = new LockScreenComponent(accountsService)
    unlocked = 0
    component.unlocked.subscribe(() => unlocked++)
  })

  it('unlocks with the password and clears it', async () => {
    accountsService.unlock.and.resolveTo()
    component.password = 'secret'

    await component.unlock()

    expect(accountsService.unlock).toHaveBeenCalledWith('secret')
    expect(unlocked).toBe(1)
    expect(component.password).toBe('')
    expect(component.invalidPassword).toBeFalse()
  })

  it('tells the user when the password is wrong', async () => {
    accountsService.unlock.and.rejectWith(new Error('VAULT.INVALID_PASSWORD'))
    component.password = 'wrong'

    await component.unlock()

    expect(unlocked).toBe(0)
    expect(component.invalidPassword).toBeTrue()
    expect(component.unlocking).toBeFalse()
  })

  it('does nothing without a password', async () => {
    await component.unlock()

    expect(accountsService.unlock).not.toHaveBeenCalled()
  })
});
