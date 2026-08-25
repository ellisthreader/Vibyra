// Pure queue logic behind `notificationStore`. No React, no zustand, no
// timers — everything here is a function of (state, input, now), which is what
// makes the coalescing and ordering rules testable in plain Node.

import { rankFor } from "../lib/notificationTiers.ts";
import type { NotificationInput, NotificationItem, NotificationKind } from "../notificationTypes";

/** History is a capped ring; the bell is a glance surface, not an archive. */
export const HISTORY_MAX = 100;
/** More than three stacked toasts covers the terminal it is talking about. */
export const TOAST_MAX = 3;
/** Same dedupeKey inside this window collapses onto the existing item. */
export const COALESCE_WINDOW_MS = 8_000;
/** Same kind inside this window is one event to a human, not N. */
export const BURST_MS = 1_200;

const SUMMARY: Record<NotificationKind, string> = {
  agent: "agent updates",
  approval: "decisions waiting",
  update: "update notices",
  account: "account notices",
  spend: "spend alerts",
  performance: "performance notices",
  preview: "preview updates",
  models: "model updates",
  project: "project notices",
  app: "app notices",
};

export function summaryTitle(kind: NotificationKind, count: number): string {
  return `${count} ${SUMMARY[kind]}`;
}

export interface QueueState {
  history: NotificationItem[];
  visible: NotificationItem[];
}

export interface QueueResult extends QueueState {
  /** The item the caller should arm a timer for — the survivor of a collapse. */
  item: NotificationItem;
  /** True when this push landed on an existing item. Repeats never replay a
   * sound and never raise an OS notification. */
  isRepeat: boolean;
  /** Toasts this push pushed off the stack; their timers must be cleared. */
  evicted: number[];
}

/**
 * Level 0: an ongoing thing reporting its next state. Unbounded by time on
 * purpose — a 40 MB download outlives the coalesce window by minutes, and the
 * whole point is that it keeps one card the entire way.
 */
function replaceMatch(history: NotificationItem[], input: NotificationInput) {
  if (input.replaceKey === undefined) return undefined;
  return history.find((item) => item.replaceKey === input.replaceKey);
}

/** Level 1: an exact dedupeKey match still inside the coalesce window. */
function exactMatch(history: NotificationItem[], input: NotificationInput, now: number) {
  if (input.dedupeKey === undefined) return undefined;
  return history.find(
    (item) => item.dedupeKey === input.dedupeKey && now - item.at <= COALESCE_WINDOW_MS,
  );
}

/** Level 2: the newest item shares this kind and arrived a blink ago. */
function burstMatch(history: NotificationItem[], input: NotificationInput, now: number) {
  const head = history[0];
  if (!head || head.kind !== input.kind) return undefined;
  return now - head.at <= BURST_MS ? head : undefined;
}

/**
 * The stack, ordered.
 *
 * Rank first, then recency — so an unanswered `ask` sits at the corner and a
 * burst of finished agents queues behind it instead of scrolling it away. The
 * sort must be stable within a rank, which `Array.sort` is, so the recency
 * comparison alone settles ties.
 */
function surface(visible: NotificationItem[], item: NotificationItem): NotificationItem[] {
  const next = [item, ...visible.filter((entry) => entry.id !== item.id)];
  return next.sort((left, right) => rankFor(left.tier) - rankFor(right.tier) || right.at - left.at);
}

export function enqueue(
  state: QueueState,
  input: NotificationInput,
  id: number,
  now: number,
): QueueResult {
  const superseded = replaceMatch(state.history, input);
  const target = superseded
    ? undefined
    : exactMatch(state.history, input, now) ?? burstMatch(state.history, input, now);
  // A superseded notice keeps its id, so its timer, its DOM node and its place
  // in the stack all survive the swap rather than the card flickering out and
  // back in on every progress tick.
  const item: NotificationItem = superseded
    ? { ...input, id: superseded.id, at: now, count: 1, read: false }
    : target
      ? collapse(target, now)
      : { ...input, id, at: now, count: 1, read: false };
  const history =
    superseded || target
      ? [item, ...state.history.filter((entry) => entry.id !== item.id)]
      : [item, ...state.history].slice(0, HISTORY_MAX);
  // A supersede is a repeat only while the tier holds. A download ticking from
  // 12% to 48% must not chime forty times; the moment it becomes "restart to
  // finish" it is a different event, and that one has earned the cue and the
  // desktop notification.
  const isRepeat = superseded ? superseded.tier === item.tier : target !== undefined;
  // A pinned notice draws in the banner slot, so it never spends a toast slot.
  if (item.pinned) {
    return {
      history,
      visible: state.visible.filter((entry) => entry.id !== item.id),
      item,
      isRepeat,
      evicted: [],
    };
  }
  const stacked = surface(state.visible, item);
  return {
    history,
    visible: stacked.slice(0, TOAST_MAX),
    item,
    isRepeat,
    evicted: stacked.slice(TOAST_MAX).map((entry) => entry.id),
  };
}

/**
 * Who holds the banner slot after a push.
 *
 * The subtlety is the third case. A superseded notice keeps its id, so an
 * update going from `ready` (pinned) to `error` (not pinned) hands back an item
 * with the pinned item's id and `pinned` false. Without the id check the slot
 * would keep the stale "Restart to finish" card while a failure toast said the
 * opposite directly underneath it.
 */
export function nextPinned(
  current: NotificationItem | null,
  item: NotificationItem,
): NotificationItem | null {
  if (item.pinned) return item;
  return current?.id === item.id ? null : current;
}

function collapse(target: NotificationItem, now: number): NotificationItem {
  const count = target.count + 1;
  // Only a true burst earns a summary title. A repeat eight seconds later is
  // still the same sentence, just with a count on it.
  const burst = now - target.at <= BURST_MS;
  return {
    ...target,
    at: now,
    count,
    read: false,
    title: burst ? summaryTitle(target.kind, count) : target.title,
  };
}
