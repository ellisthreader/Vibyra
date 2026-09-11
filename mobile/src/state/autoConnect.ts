import type { WorkspaceStore } from './WorkspaceStore';

/** How long to wait before each further attempt once one has failed. A computer
 *  that is restarting, or a Wi-Fi that dropped for a moment, comes back inside
 *  this ladder; past its end the person is told the truth rather than watched. */
export const RETRY_DELAYS = [1500, 3000, 6000, 12000];

/** An attempt this slow was not refused by the network. The computer answered
 *  and is holding this phone in its approval queue, because the trust it had is
 *  gone — asking again would only put another request on someone's screen. */
const HELD_FOR_APPROVAL = 45000;

const BUSY = ['connected', 'connecting', 'pairing'];

/**
 * Keeps the saved computer connected without anyone asking for it. It is
 * reconnected when the app opens, when it returns to the front, when a network
 * comes back and after a connection drops. It is left alone in exactly the two
 * cases the person would recognise: they pressed Disconnect, and the computer
 * genuinely cannot be reached, which the ladder above establishes before it
 * gives up. Opening the app is never one of them.
 */
export class AutoConnect {
  /** True while this is the attempt in flight, so an explicit connect may take over. */
  attempting = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private away = false;
  constructor(private store: WorkspaceStore, private delays: number[] = RETRY_DELAYS) {}

  /** Connect now: the app opened, came back to the front, or found a network. */
  resume() { this.away = false; this.attempt = 0; this.schedule(0); }
  /** The app left the screen. Nothing is worth attempting until it is back. */
  sleep() { this.away = true; this.cancel(); }
  /** Connected. The next drop starts the ladder from its first rung again. */
  settled() { this.cancel(); this.attempt = 0; }
  /** Put away by hand, forgotten, or torn down. */
  stop() { this.cancel(); this.attempt = 0; }
  /** A connection dropped: take the next rung of the ladder, or give up on it. */
  retry() { const delay = this.delays[this.attempt]; this.attempt += 1; this.schedule(delay ?? -1); }
  /** An attempt failed, with how long it took. Only a quick failure is a network
   *  saying no; a slow one is a computer waiting for its owner. */
  failed(elapsed: number) { if (elapsed < HELD_FOR_APPROVAL) this.retry(); else this.stop(); }

  private schedule(delay: number) {
    this.cancel();
    if (delay < 0 || !this.wanted()) return;
    this.waiting(true);
    this.timer = setTimeout(() => { this.timer = null; void this.run(); }, delay);
  }
  private cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.waiting(false);
  }
  private waiting(value: boolean) {
    if (this.store.state.reconnecting !== value) this.store.update({ reconnecting: value });
  }
  private wanted() {
    return !this.away && Boolean(this.store.saved) && this.store.saved!.autoConnect !== false;
  }
  private async run() {
    // Something else is already reaching this computer. Whatever it is reports
    // back through settled() or failed(), so the ladder waits for that rather
    // than opening a second connection alongside it.
    if (!this.wanted() || BUSY.includes(this.store.state.status)) { this.cancel(); return; }
    this.attempting = true;
    // open() drives the ladder from its own result, including this failure.
    try { await this.store.actions.reconnect!(); } catch { /* reported into state */ }
    finally { this.attempting = false; }
  }
}
