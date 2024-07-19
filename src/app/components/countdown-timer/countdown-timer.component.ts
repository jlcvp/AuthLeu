import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-countdown-timer',
  templateUrl: './countdown-timer.component.html',
  styleUrls: ['./countdown-timer.component.scss'],
})
export class CountdownTimerComponent {
  private timerRefreshInterval: any
  private _timerStartTime = 0
  private _seconds = 0
  @Input() set seconds(value: number) {
    this._seconds = value
    this.timerLabel = value
    this.stopTimer()
  }
  get seconds(): number {
    return this._seconds
  }

  @Output() timerEnd = new EventEmitter<void>();

  timerLabel: number = 0;

  constructor() { }

  public startTimer() {
    this.setupTimerInterval()
  }

  private stopTimer() {
    if(this.timerRefreshInterval) {
      clearInterval(this.timerRefreshInterval)
    }
  }

  private setupTimerInterval() {
    if(this.timerRefreshInterval) {
      clearInterval(this.timerRefreshInterval)
    }
    
    this.timerLabel = this.seconds // reset timer label
    this._timerStartTime = Date.now() // reset timer start time

    this.timerRefreshInterval = setInterval(() => {
      this.updateTimerLabel()
      if(this.timerLabel <= 0) {
        clearInterval(this.timerRefreshInterval)
        this.timerEnd.emit()
      }
    }, 250) // for precision purposes check every 250ms
  }

  private updateTimerLabel() {
    const elapsedTime = Math.ceil((Date.now() - this._timerStartTime)/1000)
    this.timerLabel = this.seconds - elapsedTime
  }

}
