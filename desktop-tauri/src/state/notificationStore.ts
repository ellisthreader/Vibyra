// The notification store: a thin zustand shell over the pure queue.
//
// History is in-memory only and never persisted. Every settings write is an
// atomic disk write, so persisting would mean one write per notification; and
// bodies carry agent prompt text, which this repo already refuses to put on
// disk by default (`persist_terminal_scrollback`). Losing the list on quit is
// the correct trade.
//
// Import rule, load-bearing: this module may import the queue, the policy, the
// sound engine and types — nothing else. Reaching for `settingsStore` or
// `terminalStore` here would close the cycle
// settingsStore -> terminalRegistry -> ... -> notificationStore. Preferences
// are pushed in via `setPrefs`; OS escalation and window focus arrive through
// the injectable hooks below.

import { create } from "zustand";

import { cueFor, createOsGate, shouldEscalate, shouldShow } from "../lib/notificationPolicy";
import { playCue } from "../lib/notificationSounds";
import { allowCue, soundGate } from "../lib/soundGate";
import { enqueue, timeoutFor } from "./notificationQueue";
import type { NotificationInput, NotificationItem, NotificationPrefs } from "../notificationTypes";

/** Both arrays are stored fields seeded from this one constant. No selector in
 * this feature may ever return a fresh [] — useSyncExternalStore loops on it
 * (the NO_PROJECTS lesson in settingsStore.ts). */
const EMPTY: NotificationItem[] = [];

/** Auto-dismiss timers live outside the store so state stays serialisable and
 * a re-render can never re-arm one. */
interface Armed {
  handle: number;
  /** Wall-clock deadline, so a pause can bank the time that is left. */
  dueAt: number;
  remainingMs: number;
}

const timers = new Map<number, Armed>();
let paused = false;
const osGate = createOsGate();

let seq = 0;

type OsEscalator = (item: NotificationItem) => void;
type FocusProbe = () => boolean;

let escalate: OsEscalator = () => {};
/** Default "focused" means osOnlyWhenAway blocks escalation until the real
 * probe is wired — silence is the safe failure mode. */
let isFocused: FocusProbe = () => true;

export function setOsEscalator(fn: OsEscalator): void {
  escalate = fn;
}

export function setFocusProbe(fn: FocusProbe): void {
  isFocused = fn;
}

function clearTimer(id: number): void {
  const armed = timers.get(id);
  if (armed) {
    window.clearTimeout(armed.handle);
    timers.delete(id);
  }
}

function clearAllTimers(): void {
  for (const armed of timers.values()) window.clearTimeout(armed.handle);
  timers.clear();
}

interface NotificationStore {
  history: NotificationItem[];
  visible: NotificationItem[];
  unread: number;
  centreOpen: boolean;
  prefs: NotificationPrefs | null;
  push: (input: NotificationInput) => void;
  dismiss: (id: number) => void;
  dismissAllToasts: () => void;
  markAllRead: () => void;
  clearHistory: () => void;
  setCentreOpen: (open: boolean) => void;
  setPrefs: (prefs: NotificationPrefs) => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  history: EMPTY,
  visible: EMPTY,
  unread: 0,
  centreOpen: false,
  prefs: null,

  push: (input) => {
    const state = get();
    if (!shouldShow(state.prefs, input)) return;
    const now = Date.now();
    seq += 1;
    const result = enqueue(state, input, seq, now);
    for (const id of result.evicted) clearTimer(id);
    set({
      history: result.history,
      visible: result.visible,
      unread: result.history.reduce((total, item) => (item.read ? total : total + 1), 0),
    });
    arm(result.item, get().dismiss);
    if (result.isRepeat) return; // a repeat never replays a sound or re-escalates
    const cue = cueFor(state.prefs, result.item);
    if (allowCue(soundGate, cue, result.item.category, now)) {
      playCue(cue, state.prefs?.volume ?? 0);
    }
    const ctx = { focused: isFocused(), isRepeat: false, now };
    if (shouldEscalate(state.prefs, result.item, ctx, osGate)) escalate(result.item);
  },

  dismiss: (id) => {
    clearTimer(id);
    // History keeps the item — dismissing a toast is not reading it.
    const visible = get().visible.filter((item) => item.id !== id);
    set({ visible: visible.length === 0 ? EMPTY : visible });
  },

  dismissAllToasts: () => {
    clearAllTimers();
    set({ visible: EMPTY });
  },

  markAllRead: () => {
    const history = get().history;
    set({ history: history.map((item) => (item.read ? item : { ...item, read: true })), unread: 0 });
  },

  clearHistory: () => {
    clearAllTimers();
    set({ history: EMPTY, visible: EMPTY, unread: 0 });
  },

  setCentreOpen: (centreOpen) => set({ centreOpen }),

  setPrefs: (prefs) => set({ prefs }),
}));

function schedule(id: number, ms: number, dismiss: (id: number) => void): void {
  timers.set(id, {
    handle: window.setTimeout(() => {
      timers.delete(id);
      dismiss(id);
    }, ms),
    dueAt: Date.now() + ms,
    remainingMs: ms,
  });
}

function arm(item: NotificationItem, dismiss: (id: number) => void): void {
  clearTimer(item.id);
  const ms = item.timeoutMs ?? timeoutFor(item.severity);
  if (ms <= 0) return; // sticky
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
export function setTimersPaused(next: boolean): void {
  if (paused === next) return;
  paused = next;
  const dismiss = useNotificationStore.getState().dismiss;
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
