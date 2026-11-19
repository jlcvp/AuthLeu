import { TestBed } from '@angular/core/testing';
import { DocumentData, Firestore } from '@angular/fire/firestore';
import { defer, Observable, of, throwError } from 'rxjs';
import { Account2FA } from '../../models/account2FA.model';
import { AuthenticationService } from '../authentication.service';
import { LocalAccount2faService } from './local-account2fa.service';
import { RemoteAccount2faService } from './remote-account2fa.service';

const SECRET = 'JBSWY3DPEHPK3PXP'

describe('RemoteAccount2faService', () => {
  let localService: jasmine.SpyObj<LocalAccount2faService>
  let listenToAccounts: jasmine.Spy<(userId: string) => Observable<DocumentData[]>>
  let syncErrors: unknown[]
  let service: RemoteAccount2faService

  const document = (id: string) => ({ id, label: id, secret: SECRET, active: true, added: 1 })
  const syncedAccounts = () => localService.updateAccountsBatch.calls.mostRecent().args[0] as Account2FA[]
  const lastSyncError = () => syncErrors[syncErrors.length - 1]

  beforeEach(() => {
    localService = jasmine.createSpyObj<LocalAccount2faService>('LocalAccount2faService', ['getAccounts', 'updateAccountsBatch'])
    localService.getAccounts.and.resolveTo(of([]))
    localService.updateAccountsBatch.and.resolveTo()
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: AuthenticationService, useValue: { getCurrentUserId: async () => 'user-1' } },
        { provide: LocalAccount2faService, useValue: localService },
      ],
    })
    service = TestBed.inject(RemoteAccount2faService)
    listenToAccounts = spyOn(service as unknown as { listenToAccounts: (userId: string) => Observable<DocumentData[]> }, 'listenToAccounts')
    syncErrors = []
    service.syncError$.subscribe(error => syncErrors.push(error))
  })

  it('replaces the local copy with the synced accounts', async () => {
    listenToAccounts.and.returnValue(of([document('a'), document('b')]))

    await service.getAccounts()

    expect(listenToAccounts).toHaveBeenCalledWith('user-1')
    expect(syncedAccounts().map(account => account.id)).toEqual(['a', 'b'])
    expect(localService.updateAccountsBatch.calls.mostRecent().args[1]).toBeTrue()
  })

  it('skips documents that are not valid accounts', async () => {
    listenToAccounts.and.returnValue(of([document('a'), { id: 'b' }]))

    await service.getAccounts()

    expect(syncedAccounts().map(account => account.id)).toEqual(['a'])
    expect(lastSyncError()).toBeUndefined()
  })

  it('reports sync errors and retries until syncing works again', async () => {
    jasmine.clock().install()
    try {
      let attempts = 0
      listenToAccounts.and.returnValue(defer(() => ++attempts <= 2 ? throwError(() => new Error('permission-denied')) : of([document('a')])))

      await service.getAccounts()
      expect(lastSyncError()).toEqual(new Error('permission-denied'))
      expect(localService.updateAccountsBatch).not.toHaveBeenCalled()

      jasmine.clock().tick(5000) // first retry, fails again
      expect(attempts).toBe(2)
      jasmine.clock().tick(5000) // the delay doubles
      expect(attempts).toBe(2)
      jasmine.clock().tick(5000)
      expect(attempts).toBe(3)

      expect(lastSyncError()).toBeUndefined()
      expect(syncedAccounts().map(account => account.id)).toEqual(['a'])
    } finally {
      jasmine.clock().uninstall()
    }
  })

  it('loads only once when called concurrently', async () => {
    listenToAccounts.and.returnValue(of([]))

    await Promise.all([service.getAccounts(), service.getAccounts()])

    expect(localService.getAccounts).toHaveBeenCalledTimes(1)
    expect(listenToAccounts).toHaveBeenCalledTimes(1)
  })
});
