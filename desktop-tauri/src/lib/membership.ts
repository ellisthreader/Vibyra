import type { AccountProfile } from "../types";

/**
 * What a membership is, said from the account the backend sends. The phone
 * merges its own App Store wallet before reaching the same conclusions
 * (`mobile/src/settings/subscription.ts`); on the Mac the backend has
 * already projected an App Store membership into the account, so the
 * profile alone is enough. Only what is known is said: a date that promises
 * a renewal must have come from a card subscription, never from a store
 * receipt, which can only prove what has been paid for.
 */
export interface MembershipView {
  /** The plan as people see it named everywhere else. */
  plan: string;
  paid: boolean;
  /** "Renews on 12 October 2026", "Ends on 3 October 2026", "Paid through …". */
  state: string | null;
  /** How it is paid for: "Card, through Stripe", "App Store", "Google Play". */
  billing: string | null;
  cycle: string | null;
  /** Who owns cancelling and changing it, when anyone here does. */
  manage: "stripe" | "appstore" | null;
  /** The date `state` is built from, so nothing below repeats it. */
  stateDate: string | null;
}

/** Kept the same as the phone's `planNames`: one account, one set of words.
 * A rename belongs in both. */
const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  builder: "Pro 10×",
  pro: "Pro 20×",
};

const titled = (plan: string) =>
  PLAN_NAMES[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);

const valid = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? iso : null;

export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export const monthAndYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export function membershipView(profile: AccountProfile | null): MembershipView {
  const id = profile?.plan ?? "free";
  const paid = id !== "free" && id !== "sample";
  const plan = titled(id);
  if (!paid || !profile) {
    return { plan: "Free", paid: false, state: null, billing: null, cycle: null, manage: null, stateDate: null };
  }
  const stripe = profile.billingProvider === "stripe";
  const apple = profile.billingProvider?.startsWith("iap-apple") ?? false;
  const google = profile.billingProvider?.startsWith("iap-google") ?? false;
  const ends = profile.membershipCancelAtPeriodEnd
    ? valid(profile.membershipEndsAt) ?? valid(profile.planRenewsAt)
    : null;
  const renews = !ends && stripe ? valid(profile.planRenewsAt) : null;
  const until = !ends && !renews ? valid(profile.membershipEndsAt) : null;
  return {
    plan,
    paid,
    state: ends
      ? `Ends on ${longDate(ends)}`
      : renews
        ? `Renews on ${longDate(renews)}`
        : until
          ? `Paid through ${longDate(until)}`
          : null,
    billing: stripe ? "Card, through Stripe" : apple ? "App Store" : google ? "Google Play" : null,
    // Store plans are sold monthly; a card plan says which cycle it is on.
    cycle: stripe ? (profile.planBillingCycle === "annual" ? "Yearly" : "Monthly") : "Monthly",
    manage: stripe && profile.canManageStripeBilling ? "stripe" : apple ? "appstore" : null,
    stateDate: ends ?? renews ?? until,
  };
}

/** Whether two dates land on the same day, so a card states one of them once. */
export function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const [first, second] = [new Date(a), new Date(b)];
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false;
  return first.toDateString() === second.toDateString();
}

/** "£20.00" from pence, for a top-up row. */
export function pounds(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}
