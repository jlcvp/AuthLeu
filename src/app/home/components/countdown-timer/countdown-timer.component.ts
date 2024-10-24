import { Component, EventEmitter, Input, Output, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { takeWhile, map } from 'rxjs/operators';

@Component({
  selector: 'app-countdown-timer',
  templateUrl: './countdown-timer.component.html',
  styleUrls: ['./countdown-timer.component.scss'],
})
export class CountdownTimerComponent implements OnDestroy {
  private _seconds = 0;
  private timerSubscription: Subscription | null = null;

  @Input() set seconds(value: number) {
    this._seconds = value;
    this.timerLabel = value;
    this.stopTimer();
  }
  get seconds(): number {
    return this._seconds;
  }

  @Output() timerEnd = new EventEmitter<void>();

  timerLabel: number = 0;

  constructor() { }

  public startTimer() {
    this.setupTimerInterval();
  }

  private stopTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  private setupTimerInterval() {
    this.stopTimer(); // Ensure any existing timer is stopped

    this.timerLabel = this.seconds; // reset timer label

    this.timerSubscription = interval(1000).pipe(
      map(elapsed => this.seconds - elapsed - 1),
      takeWhile(remaining => remaining > 0)
    ).subscribe({
      next: remaining => this.timerLabel = remaining,
      complete: () => this.timerEnd.emit()
    });
  }

  ngOnDestroy() {
    this.stopTimer();
  }
}
