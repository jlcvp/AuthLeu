import { Component, EventEmitter, Input, Output, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-countdown-timer',
  templateUrl: './countdown-timer.component.html',
  styleUrls: ['./countdown-timer.component.scss'],
})
export class CountdownTimerComponent implements OnDestroy {
  private _endTime = 0;
  private timerSubscription: Subscription | null = null;

  /** When the countdown ends, in milliseconds since the epoch */
  @Input() set endTime(value: number) {
    this._endTime = value;
    this.startTimer();
  }
  get endTime(): number {
    return this._endTime;
  }

  @Output() timerEnd = new EventEmitter<void>();

  timerLabel: number = 0;

  constructor() { }

  private startTimer() {
    this.stopTimer(); // Ensure any existing timer is stopped
    this.updateTimerLabel();

    // Compute the time left from the clock on every tick: timers are throttled
    // in background tabs, so counting ticks would drift
    this.timerSubscription = interval(250).subscribe(() => {
      if (this.updateTimerLabel() <= 0) {
        this.stopTimer();
        this.timerEnd.emit();
      }
    });
  }

  private stopTimer() {
    this.timerSubscription?.unsubscribe();
    this.timerSubscription = null;
  }

  /** Updates the label with the seconds left, and returns them */
  private updateTimerLabel(): number {
    this.timerLabel = Math.max(0, Math.ceil((this._endTime - Date.now()) / 1000));
    return this.timerLabel;
  }

  ngOnDestroy() {
    this.stopTimer();
  }
}
