// Coalesces a burst of events into a single callback fired once the source
// goes quiet for `quietMs` milliseconds. Each event during the burst resets
// the timer. Suppressing the next fire (see `suppressNext`) drops the *one*
// callback that lands during the current burst — useful when the extension
// itself just performed the operation that's about to trigger the watcher.
//
// All timing goes through the injected `setTimeoutFn` / `clearTimeoutFn` so
// tests can drive it with a fake clock.
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private suppressed = false;

  constructor(
    private readonly quietMs: number,
    private readonly callback: () => void,
    private readonly setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
    private readonly clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void = clearTimeout
  ) {}

  // Records that one event arrived. Schedules (or re-schedules) the
  // coalesced callback to run after `quietMs` of silence.
  trigger(): void {
    if (this.timer !== undefined) {
      this.clearTimeoutFn(this.timer);
    }
    this.timer = this.setTimeoutFn(() => {
      this.timer = undefined;
      if (this.suppressed) {
        this.suppressed = false;
        return;
      }
      this.callback();
    }, this.quietMs);
  }

  // Marks that the next coalesced fire should be dropped. Use before
  // initiating an action that itself will trigger the underlying event
  // source — e.g. a jj mutation that will land an op and so cause our
  // own watcher to fire.
  //
  // Stays armed until either a fire arrives and is swallowed, or `disarm`
  // is called. If no fire arrives at all (the action errored before
  // mutating), the suppression persists and would eat a later legitimate
  // event; pair `suppressNext()` with `disarm()` in an action's error
  // path.
  suppressNext(): void {
    this.suppressed = true;
  }

  disarm(): void {
    this.suppressed = false;
  }

  dispose(): void {
    if (this.timer !== undefined) {
      this.clearTimeoutFn(this.timer);
      this.timer = undefined;
    }
  }
}
