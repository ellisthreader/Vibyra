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
import { enqueue, nextPinned } from "./notificationQueue";
import { armTimer, clearAllTimers, clearTimer, pauseTimers } from "./notificationTimers";
import type { NotificationInput, NotificationItem, NotificationPrefs } from "../notificationTypes";

/** Both arrays are stored fields seeded from this one constant. No selector in
 * this feature may ever return a fresh [] — useSyncExternalStore loops on it
 * (the NO_PROJECTS lesson in settingsStore.ts). */
const EMPTY: NotificationItem[] = [];

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

interface NotificationStore {
  history: NotificationItem[];
  visible: NotificationItem[];
  /** The one notice drawn in the banner slot above the workspace, or none. */
  pinned: NotificationItem | null;
  /** Notices the stack could not fit since it was last empty. Drawn as one
   * "+N more" row rather than allowed to vanish silently. */
  overflow: number;
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
  pinned: null,
  overflow: 0,
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
      pinned: nextPinned(state.pinned, result.item),
      overflow: state.overflow + result.evicted.length,
      unread: result.history.reduce((total, item) => (item.read ? total : total + 1), 0),
    });
    armTimer(result.item, get().dismiss);
    if (result.isRepeat) return; // a repeat never replays a sound or re-escalates
    const cue = cueFor(state.prefs, result.item);
    if (allowCue(soundGate, cue, result.item.kind, now)) {
      playCue(cue, state.prefs?.volume ?? 0);
    }
    const ctx = { focused: isFocused(), isRepeat: false, now };
    if (shouldEscalate(state.prefs, result.item, ctx, osGate)) escalate(result.item);
  },

  dismiss: (id) => {
    clearTimer(id);
    // History keeps the item — dismissing a toast is not reading it.
    const state = get();
    const visible = state.visible.filter((item) => item.id !== id);
    set({
      visible: visible.length === 0 ? EMPTY : visible,
      pinned: state.pinned?.id === id ? null : state.pinned,
      // The counter belongs to a run of stacked toasts; an empty stack has
      // nothing left to be "more" than.
      overflow: visible.length === 0 ? 0 : state.overflow,
    });
  },

  dismissAllToasts: () => {
    clearAllTimers();
    set({ visible: EMPTY, overflow: 0 });
  },

  markAllRead: () => {
    const history = get().history;
    set({ history: history.map((item) => (item.read ? item : { ...item, read: true })), unread: 0 });
  },

  clearHistory: () => {
    clearAllTimers();
    set({ history: EMPTY, visible: EMPTY, pinned: null, overflow: 0, unread: 0 });
  },

  // Opening the centre is where the overflow went, so the counter has served
  // its purpose the moment the user looks.
  setCentreOpen: (centreOpen) => set(centreOpen ? { centreOpen, overflow: 0 } : { centreOpen }),

  setPrefs: (prefs) => set({ prefs }),
}));

/** The stack's hover handler. Thin wrapper so the timers module never has to
 * import the store it would otherwise close a cycle with. */
export function setTimersPaused(next: boolean): void {
  pauseTimers(next, useNotificationStore.getState().dismiss);
}
