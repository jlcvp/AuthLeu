import { Component, EventEmitter, Output } from '@angular/core';
import { Account2faService } from 'src/app/services/accounts/account2fa.service';

/** Covers the app while the data key is locked, and unlocks it with the password */
@Component({
    selector: 'app-lock-screen',
    templateUrl: './lock-screen.component.html',
    styleUrls: ['./lock-screen.component.scss'],
    standalone: false
})
export class LockScreenComponent {
  @Output() unlocked = new EventEmitter<void>()
  @Output() signOut = new EventEmitter<void>()

  password = ''
  invalidPassword = false
  unlocking = false

  constructor(private accountsService: Account2faService) { }

  async unlock() {
    if (!this.password || this.unlocking) {
      return
    }
    this.unlocking = true
    this.invalidPassword = false
    try {
      await this.accountsService.unlock(this.password)
      this.password = ''
      this.unlocked.emit()
    } catch (error) {
      console.warn('Failed to unlock', error)
      this.invalidPassword = true
    } finally {
      this.unlocking = false
    }
  }
}
