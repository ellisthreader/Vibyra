// Auto-dismiss timers, kept out of the store so its state stays serialisable
// and a re-render can never re-arm one.
//
// Split from `notificationStore.ts` when the tier work pushed that file over
// the line limit, and it is the right seam anyway: everything here is wall
// clock and `window.setTimeout`, and none of it belongs in a zustand model.

import { timeoutFor } from "../lib/notificationTiers.ts";
import type { NotificationItem } from "../notificationTypes";

type Dismiss = (id: number) => void;

interface Armed {
  handle: number;
  /** Wall-clock deadline, so a pause can bank the time that is left. */
  dueAt: number;
  remainingMs: number;
}

const timers = new Map<number, Armed>();
let paused = false;

export function clearTimer(id: number): void {
  const armed = timers.get(id);
  if (armed) {
    window.clearTimeout(armed.handle);
    timers.delete(id);
  }
}

export function clearAllTimers(): void {
  for (const armed of timers.values()) window.clearTimeout(armed.handle);
  timers.clear();
}

function schedule(id: number, ms: number, dismiss: Dismiss): void {
  timers.set(id, {
    handle: window.setTimeout(() => {
      timers.delete(id);
      dismiss(id);
    }, ms),
    dueAt: Date.now() + ms,
    remainingMs: ms,
  });
}

/** Arms an item's dismissal, or leaves it standing when its tier is sticky. */
export function armTimer(item: NotificationItem, dismiss: Dismiss): void {
  clearTimer(item.id);
  // A pinned notice holds the banner slot until it is acted on or replaced;
  // otherwise the tier decides, and an explicit `timeoutMs` overrides both.
  const ms = item.pinned ? 0 : item.timeoutMs ?? timeoutFor(item.tier);
  if (ms <= 0) return;
  if (paused) {
    // Armed but not running: a toast that arrives while the user is reading the
    // stack must not start counting down behind their cursor.
    timers.set(item.id, { handle: 0, dueAt: 0, remainingMs: ms });
    return;
  }
  schedule(item.id, ms, dismiss);
}

/**
 * Hovering the stack freezes every countdown, and leaving resumes from where it
 * stopped rather than restarting. The CSS timer bar pauses on the same event,
 * so bar and deadline stay in step — a bar that empties while the toast lingers
 * (or the reverse) reads as a bug.
 */
export function pauseTimers(next: boolean, dismiss: Dismiss): void {
  if (paused === next) return;
  paused = next;
  const now = Date.now();
  for (const [id, armed] of timers) {
    if (next) {
      window.clearTimeout(armed.handle);
      timers.set(id, { handle: 0, dueAt: 0, remainingMs: Math.max(0, armed.dueAt - now) });
    } else {
      schedule(id, armed.remainingMs, dismiss);
    }
  }
}
