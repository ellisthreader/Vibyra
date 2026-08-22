// Pure queue logic behind `notificationStore`. No React, no zustand, no
// timers — everything here is a function of (state, input, now), which is what
// makes the coalescing rules testable in plain Node.

import type {
  NotificationCategory,
  NotificationInput,
  NotificationItem,
  NotificationSeverity,
} from "../notificationTypes";

/** History is a capped ring; the bell is a glance surface, not an archive. */
export const HISTORY_MAX = 100;
/** More than three stacked toasts covers the terminal it is talking about. */
export const TOAST_MAX = 3;
/** Same dedupeKey inside this window collapses onto the existing item. */
export const COALESCE_WINDOW_MS = 8_000;
/** Same category inside this window is one event to a human, not N. */
export const BURST_MS = 1_200;

export function timeoutFor(severity: NotificationSeverity): number {
  if (severity === "danger") return 0; // sticky: failures must be acknowledged
  if (severity === "warning") return 8_000;
  return severity === "success" ? 5_000 : 4_500;
}

const SUMMARY: Record<NotificationCategory, string> = {
  agentAttention: "agents need you",
  agentDone: "agents finished",
  agentFailed: "agents failed",
  performance: "performance notices",
  preview: "preview updates",
  aiSpend: "spend alerts",
  models: "model updates",
  system: "app notices",
};

export function summaryTitle(category: NotificationCategory, count: number): string {
  return `${count} ${SUMMARY[category]}`;
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

/** Level 1: an exact dedupeKey match still inside the coalesce window. */
function exactMatch(history: NotificationItem[], input: NotificationInput, now: number) {
  if (input.dedupeKey === undefined) return undefined;
  return history.find(
    (item) => item.dedupeKey === input.dedupeKey && now - item.at <= COALESCE_WINDOW_MS,
  );
}

/** Level 2: the newest item shares this category and arrived a blink ago. */
function burstMatch(history: NotificationItem[], input: NotificationInput, now: number) {
  const head = history[0];
  if (!head || head.category !== input.category) return undefined;
  return now - head.at <= BURST_MS ? head : undefined;
}

function surface(visible: NotificationItem[], item: NotificationItem): QueueState["visible"] {
  return [item, ...visible.filter((entry) => entry.id !== item.id)];
}

export function enqueue(
  state: QueueState,
  input: NotificationInput,
  id: number,
  now: number,
): QueueResult {
  const target = exactMatch(state.history, input, now) ?? burstMatch(state.history, input, now);
  const item: NotificationItem = target
    ? collapse(target, now)
    : { ...input, id, at: now, count: 1, read: false };
  const history = target
    ? [item, ...state.history.filter((entry) => entry.id !== item.id)]
    : [item, ...state.history].slice(0, HISTORY_MAX);
  const stacked = surface(state.visible, item);
  return {
    history,
    visible: stacked.slice(0, TOAST_MAX),
    item,
    isRepeat: target !== undefined,
    evicted: stacked.slice(TOAST_MAX).map((entry) => entry.id),
  };
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
    title: burst ? summaryTitle(target.category, count) : target.title,
  };
}
