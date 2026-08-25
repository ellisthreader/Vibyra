// Every "should this surface / sound / escalate" decision, as pure functions
// over an explicit gate object. Keeping it out of the store is what lets the
// escalation matrix be a unit test rather than a manual checklist.

import type {
  NotificationChannel,
  NotificationInput,
  NotificationItem,
  NotificationKind,
  NotificationPrefs,
  SoundCueId,
} from "../notificationTypes";
import { canEscalate } from "./notificationTiers.ts";

/** OS toasts are interruptive: at most one every few seconds, and a hard
 * ceiling per minute so a runaway trigger cannot carpet the desktop. */
const OS_MIN_GAP_MS = 5_000;
const OS_WINDOW_MS = 60_000;
const OS_PER_WINDOW = 6;

export interface OsGate {
  sentAt: number[];
}

export function createOsGate(): OsGate {
  return { sentAt: [] };
}

/** Prefs arrive from disk a tick after boot. Until then we show notifications
 * but stay silent and never escalate — a missed chime beats a surprise one. */
function channelFor(prefs: NotificationPrefs, kind: NotificationKind): NotificationChannel {
  return prefs.kinds[kind]?.channel ?? "app";
}

export function shouldShow(prefs: NotificationPrefs | null, input: NotificationInput): boolean {
  if (!prefs) return true;
  if (!prefs.enabled) return false;
  return channelFor(prefs, input.kind) !== "off";
}

export function cueFor(prefs: NotificationPrefs | null, item: NotificationItem): SoundCueId {
  if (!prefs || !prefs.enabled || !prefs.soundEnabled || prefs.volume <= 0) return "none";
  if (channelFor(prefs, item.kind) === "off") return "none";
  return item.cue ?? prefs.kinds[item.kind]?.cue ?? "none";
}

export interface EscalationContext {
  /** Whether the app window currently has focus. */
  focused: boolean;
  isRepeat: boolean;
  now: number;
}

export function shouldEscalate(
  prefs: NotificationPrefs | null,
  item: NotificationItem,
  ctx: EscalationContext,
  gate: OsGate,
): boolean {
  if (ctx.isRepeat) return false;
  if (!prefs || !prefs.enabled || !prefs.osEnabled) return false;
  if (item.osEligible === false) return false;
  // The tier decides whether the desktop may ever hear about this at all;
  // `busy` and `news` never can, whatever the preferences say.
  if (!canEscalate(item.tier)) return false;
  if (channelFor(prefs, item.kind) !== "system") return false;
  if (prefs.osOnlyWhenAway && ctx.focused) return false;
  // Last, because it consumes a slot: a notification blocked above must not
  // spend the budget of one that would have been allowed.
  return takeOsSlot(gate, ctx.now);
}

function takeOsSlot(gate: OsGate, now: number): boolean {
  const sentAt = gate.sentAt.filter((at) => now - at < OS_WINDOW_MS);
  gate.sentAt = sentAt;
  if (sentAt.length >= OS_PER_WINDOW) return false;
  const last = sentAt[sentAt.length - 1];
  if (last !== undefined && now - last < OS_MIN_GAP_MS) return false;
  sentAt.push(now);
  return true;
}
