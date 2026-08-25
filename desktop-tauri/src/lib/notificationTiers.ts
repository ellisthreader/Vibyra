// Everything a tier decides, in one table.
//
// The old design spread these rules across four files — the lifetime lived in
// the queue, the politeness in the marks, the escalation ban in the policy, and
// the colour in a stylesheet — which is how `info` ended up meaning both
// "harmless" and "never allowed to reach the desktop". One table, read by all
// of them, is the point of the tier axis.
//
// Pure and free of React so the escalation matrix stays a unit test.

import type { NotificationTier } from "../notificationTypes";

export interface TierRule {
  /** Milliseconds on screen; 0 is sticky. */
  timeoutMs: number;
  /**
   * Position in the toast stack, lowest first. Rank is the whole reason a
   * blocked agent can no longer be pushed off screen by three finished ones.
   */
  rank: number;
  /** Interrupts a screen reader rather than waiting for a pause. */
  loud: boolean;
  /** May reach the operating system, preferences permitting. */
  escalates: boolean;
}

const RULES: Record<NotificationTier, TierRule> = {
  // Blocked on a human. Sticky, first in the stack, and the only tier that is
  // always worth the desktop: the whole point is that you may be elsewhere.
  ask: { timeoutMs: 0, rank: 1, loud: true, escalates: true },

  // Broke. Sticky because a failure that scrolled away was never acknowledged.
  fail: { timeoutMs: 0, rank: 2, loud: true, escalates: true },

  // Will break if ignored. Long enough to read twice, short enough to forgive.
  risk: { timeoutMs: 12_000, rank: 3, loud: true, escalates: true },

  // Under way. Never escalates and never announces: a desktop toast per
  // download tick is the definition of noise.
  busy: { timeoutMs: 0, rank: 4, loud: false, escalates: false },

  done: { timeoutMs: 5_000, rank: 5, loud: false, escalates: true },

  // Worth knowing when you look up. Never interrupts anything, anywhere.
  news: { timeoutMs: 6_500, rank: 6, loud: false, escalates: false },
};

export function timeoutFor(tier: NotificationTier): number {
  return RULES[tier].timeoutMs;
}

export function rankFor(tier: NotificationTier): number {
  return RULES[tier].rank;
}

/** Warnings, failures and decisions interrupt; good news waits its turn. */
export function isLoud(tier: NotificationTier): boolean {
  return RULES[tier].loud;
}

export function canEscalate(tier: NotificationTier): boolean {
  return RULES[tier].escalates;
}

/** How the tier reads on the card's chip, beside the kind. */
export const TIER_LABELS: Record<NotificationTier, string> = {
  ask: "Needs you",
  fail: "Failed",
  risk: "At risk",
  busy: "Working",
  done: "Done",
  news: "News",
};

/**
 * The centre's filters, as the questions people actually ask their history.
 * `null` means every tier.
 */
export const TIER_FILTERS: { id: string; label: string; tiers: NotificationTier[] | null }[] = [
  { id: "all", label: "All", tiers: null },
  { id: "needs", label: "Needs you", tiers: ["ask"] },
  { id: "problems", label: "Problems", tiers: ["fail", "risk"] },
  { id: "activity", label: "Activity", tiers: ["busy", "done", "news"] },
];
