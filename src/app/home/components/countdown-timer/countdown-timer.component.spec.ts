import { CountdownTimerComponent } from './countdown-timer.component';

describe('CountdownTimerComponent', () => {
  let component: CountdownTimerComponent
  let ended: number

  beforeEach(() => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date(Date.UTC(2026, 0, 1)))
    component = new CountdownTimerComponent()
    ended = 0
    component.timerEnd.subscribe(() => ended++)
  })

  afterEach(() => {
    component.ngOnDestroy()
    jasmine.clock().uninstall()
  })

  it('counts down the seconds left until the end time, and ends once', () => {
    component.endTime = Date.now() + 3000
    expect(component.timerLabel).toBe(3)

    jasmine.clock().tick(1000)
    expect(component.timerLabel).toBe(2)
    jasmine.clock().tick(1000)
    expect(component.timerLabel).toBe(1)
    expect(ended).toBe(0)

    jasmine.clock().tick(1000)
    expect(ended).toBe(1)
    jasmine.clock().tick(5000)
    expect(ended).toBe(1)
  })

  it('rounds partial seconds up', () => {
    component.endTime = Date.now() + 2500

    expect(component.timerLabel).toBe(3)
  })

  it('follows the clock when timers are throttled', () => {
    component.endTime = Date.now() + 30000

    // like a background tab: the clock moves on while no timers run
    jasmine.clock().mockDate(new Date(Date.now() + 29000))
    jasmine.clock().tick(250)
    expect(component.timerLabel).toBe(1)

    jasmine.clock().mockDate(new Date(Date.now() + 5000))
    jasmine.clock().tick(250)
    expect(ended).toBe(1)
  })
});
