import { NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DataKey, VaultOptions } from '../models/vault.model';
import { AppConfigService } from './app-config.service';
import { AutoLockService } from './auto-lock.service';
import { VaultService } from './vault.service';

describe('AutoLockService', () => {
  let options: VaultOptions
  let dataKey$: BehaviorSubject<DataKey | undefined>
  let vault: { dataKey$: BehaviorSubject<DataKey | undefined>, dataKey: DataKey | undefined, lock: jasmine.Spy }
  let service: AutoLockService
  const now = Date.UTC(2026, 0, 1)
  const minutes = (count: number) => count * 60_000

  beforeEach(() => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date(now))
    options = { rememberUnlock: false, autoLockMinutes: 5 }
    dataKey$ = new BehaviorSubject<DataKey | undefined>({ keyId: 'key', key: {} as CryptoKey })
    vault = {
      dataKey$,
      get dataKey() { return dataKey$.value },
      lock: jasmine.createSpy('lock').and.callFake(() => dataKey$.next(undefined)),
    }
    const appConfig = { getVaultOptions: async () => options }
    const zone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() }
    service = new AutoLockService(vault as unknown as VaultService, appConfig as unknown as AppConfigService, zone as unknown as NgZone)
    service.start()
  })

  afterEach(() => {
    service.stop()
    jasmine.clock().uninstall()
  })

  it('locks after the configured minutes without activity', async () => {
    jasmine.clock().mockDate(new Date(now + minutes(4)))
    await service.check()
    expect(vault.lock).not.toHaveBeenCalled()

    jasmine.clock().mockDate(new Date(now + minutes(5)))
    await service.check()
    expect(vault.lock).toHaveBeenCalled()
  })

  it('counts from the last user interaction', async () => {
    jasmine.clock().mockDate(new Date(now + minutes(4)))
    document.dispatchEvent(new Event('pointerdown'))

    jasmine.clock().mockDate(new Date(now + minutes(8)))
    await service.check()

    expect(vault.lock).not.toHaveBeenCalled()
  })

  it('does not lock when the unlock is remembered on the device, or set to never lock', async () => {
    jasmine.clock().mockDate(new Date(now + minutes(60)))

    options = { rememberUnlock: true, autoLockMinutes: 5 }
    await service.check()
    options = { rememberUnlock: false, autoLockMinutes: 0 }
    await service.check()

    expect(vault.lock).not.toHaveBeenCalled()
  })

  it('checks when the page becomes visible again, as timers are throttled in the background', () => {
    const check = spyOn(service, 'check').and.resolveTo()

    document.dispatchEvent(new Event('visibilitychange'))

    expect(check).toHaveBeenCalled()
  })

  it('counts unlocking as activity', async () => {
    vault.lock()
    jasmine.clock().mockDate(new Date(now + minutes(10)))
    dataKey$.next({ keyId: 'key', key: {} as CryptoKey })
    vault.lock.calls.reset()

    jasmine.clock().mockDate(new Date(now + minutes(12)))
    await service.check()

    expect(vault.lock).not.toHaveBeenCalled()
  })
});
