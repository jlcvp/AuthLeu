import { TestBed } from '@angular/core/testing';
import { DocumentData, Firestore } from '@angular/fire/firestore';
import { defer, Observable, of, throwError } from 'rxjs';
import { Account2FA } from '../../models/account2FA.model';
import { VaultRecord } from '../../models/vault.model';
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
    localService = jasmine.createSpyObj<LocalAccount2faService>('LocalAccount2faService', ['getAccounts', 'updateAccountsBatch', 'getVaultRecord', 'updateVaultRecord', 'deleteVaultRecord'])
    localService.getAccounts.and.resolveTo(of([]))
    localService.updateAccountsBatch.and.resolveTo()
    localService.updateVaultRecord.and.resolveTo()
    localService.deleteVaultRecord.and.resolveTo()
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

  describe('vault record', () => {
    const record = (keyId: string) => ({ version: 1, keyId, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: '00' }, wrappedKey: '00', iv: '00' }) as VaultRecord
    type VaultDocuments = {
      readVaultDocument: (userId: string) => Promise<VaultRecord | undefined>
      createVaultDocument: (userId: string, record: VaultRecord) => Promise<VaultRecord>
      writeVaultDocument: (userId: string, record: VaultRecord | undefined) => Promise<void>
    }
    let documents: jasmine.SpyObj<VaultDocuments>

    beforeEach(() => {
      const vaultDocuments = service as unknown as VaultDocuments
      documents = {
        readVaultDocument: spyOn(vaultDocuments, 'readVaultDocument'),
        createVaultDocument: spyOn(vaultDocuments, 'createVaultDocument'),
        writeVaultDocument: spyOn(vaultDocuments, 'writeVaultDocument').and.resolveTo(),
      } as jasmine.SpyObj<VaultDocuments>
    })

    it('reads the record from Firestore and keeps a local copy', async () => {
      documents.readVaultDocument.and.resolveTo(record('a'))

      expect(await service.getVaultRecord()).toEqual(record('a'))
      expect(documents.readVaultDocument).toHaveBeenCalledWith('user-1')
      expect(localService.updateVaultRecord).toHaveBeenCalledWith(record('a'))
    })

    it('removes the local copy when Firestore has no record', async () => {
      documents.readVaultDocument.and.resolveTo(undefined)

      expect(await service.getVaultRecord()).toBeUndefined()
      expect(localService.deleteVaultRecord).toHaveBeenCalled()
    })

    it('uses the local copy when Firestore cannot be reached', async () => {
      documents.readVaultDocument.and.rejectWith(new Error('Failed to get document because the client is offline'))
      localService.getVaultRecord.and.resolveTo(record('local'))

      expect(await service.getVaultRecord()).toEqual(record('local'))
      expect(localService.updateVaultRecord).not.toHaveBeenCalled()
      expect(localService.deleteVaultRecord).not.toHaveBeenCalled()
    })

    it('returns the record another device created first, and keeps a local copy of it', async () => {
      documents.createVaultDocument.and.resolveTo(record('other device'))

      expect(await service.createVaultRecord(record('this device'))).toEqual(record('other device'))
      expect(documents.createVaultDocument).toHaveBeenCalledWith('user-1', record('this device'))
      expect(localService.updateVaultRecord).toHaveBeenCalledWith(record('other device'))
    })

    it('updates and deletes the record in Firestore and locally', async () => {
      await service.updateVaultRecord(record('updated'))
      expect(documents.writeVaultDocument).toHaveBeenCalledWith('user-1', record('updated'))
      expect(localService.updateVaultRecord).toHaveBeenCalledWith(record('updated'))

      await service.deleteVaultRecord()
      expect(documents.writeVaultDocument).toHaveBeenCalledWith('user-1', undefined)
      expect(localService.deleteVaultRecord).toHaveBeenCalled()
    })
  })
});
