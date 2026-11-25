import { Injectable, NgZone } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { VaultService } from './vault.service';

/** User interactions that count as activity */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart']

/** How often to check for inactivity, in milliseconds */
const CHECK_INTERVAL = 15_000

/**
 * Locks the data key after the configured minutes without user interaction, when the password is
 * asked on every launch. Inactivity is measured with timestamps, so throttled timers (e.g. in a
 * background tab) can't extend it.
 */
@Injectable({
  providedIn: 'root'
})
export class AutoLockService {
  private lastActivity = Date.now()
  private checkTimer?: ReturnType<typeof setInterval>
  private readonly onActivity = () => this.lastActivity = Date.now()
  private readonly onVisibilityChange = () => this.check()

  constructor(private vault: VaultService, private appConfig: AppConfigService, private zone: NgZone) {
    // unlocking counts as activity
    this.vault.dataKey$.subscribe(dataKey => {
      if (dataKey) {
        this.lastActivity = Date.now()
      }
    })
  }

  /** Starts watching for inactivity */
  start(): void {
    if (this.checkTimer) {
      return
    }
    this.lastActivity = Date.now()
    // activity is frequent and doesn't change what's shown, so don't trigger change detection for it
    this.zone.runOutsideAngular(() => {
      for (const event of ACTIVITY_EVENTS) {
        document.addEventListener(event, this.onActivity, { passive: true, capture: true })
      }
      document.addEventListener('visibilitychange', this.onVisibilityChange)
      this.checkTimer = setInterval(() => this.check(), CHECK_INTERVAL)
    })
  }

  /** Stops watching for inactivity */
  stop(): void {
    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, this.onActivity, { capture: true })
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    clearInterval(this.checkTimer)
    this.checkTimer = undefined
  }

  /** Locks the data key if the user has been inactive for longer than the configured delay */
  async check(): Promise<void> {
    if (!this.vault.dataKey) {
      return
    }
    const { rememberUnlock, autoLockMinutes } = await this.appConfig.getVaultOptions()
    if (rememberUnlock || autoLockMinutes <= 0) {
      return
    }
    if (Date.now() - this.lastActivity >= autoLockMinutes * 60_000) {
      this.zone.run(() => this.vault.lock())
    }
  }
}
