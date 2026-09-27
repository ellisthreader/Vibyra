import type { Account } from '../ui/types';
import { planNames } from '../vibes/plans';

/** The subscriptions page Apple keeps for every account; there is no per-app deep link. */
export const APP_STORE_SUBSCRIPTIONS = 'https://apps.apple.com/account/subscriptions';

export interface SubscriptionView {
  plan: string;
  paid: boolean;
  /** "Renews on 12 October 2026", "Ends on …", "Paid through …", or null when nothing is known. */
  state: string | null;
  billing: string | null;
  cycle: string | null;
  manage: 'appstore' | 'stripe' | null;
  /** The home row's value: "Renews 12 Oct", "Ends 3 Oct", "Until 12 Oct", the plan, or "Free". */
  row: string;
}
const titled = (plan: string) => planNames[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
const valid = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
const long = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const short = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * What a subscription is, said from the two places that know: the Vibes wallet
 * (the App Store plans this phone sells, and the date they are paid through) and the
 * account (a card plan through Stripe, its renewal, and whether it cancels at the
 * period's end). Only what is known is said — a wallet can't tell a renewal from a
 * cancellation, so its date reads "paid through" rather than promising either.
 */
export function subscriptionState(
  account: Account | null,
  wallet: { plan: string; paidUntil: string | null } | null,
): SubscriptionView {
  const id = wallet?.plan ?? account?.plan ?? 'free';
  const paid = id !== 'free' && id !== 'sample';
  if (!paid)
    return {
      plan: 'Free',
      paid,
      state: null,
      billing: null,
      cycle: null,
      manage: null,
      row: 'Free',
    };
  const stripe = account?.billingProvider === 'stripe';
  const ends = account?.membershipCancelAtPeriodEnd
    ? (valid(account.membershipEndsAt) ?? valid(account.planRenewsAt))
    : null;
  const renews = !ends && stripe ? valid(account?.planRenewsAt) : null;
  const until = !ends && !renews ? valid(wallet?.paidUntil) : null;
  const plan = titled(id);
  return {
    plan,
    paid,
    state: ends
      ? `Ends on ${long(ends)}`
      : renews
        ? `Renews on ${long(renews)}`
        : until
          ? `Paid through ${long(until)}`
          : null,
    billing: stripe ? 'Card, through Stripe' : 'App Store',
    // App Store plans are sold monthly; a card plan says which cycle it is on.
    cycle: stripe ? (account?.planBillingCycle === 'annual' ? 'Yearly' : 'Monthly') : 'Monthly',
    manage: stripe && account?.canManageStripeBilling ? 'stripe' : 'appstore',
    row: ends
      ? `Ends ${short(ends)}`
      : renews
        ? `Renews ${short(renews)}`
        : until
          ? `Until ${short(until)}`
          : plan,
  };
}
