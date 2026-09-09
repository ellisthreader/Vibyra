import type { IconName } from '../ui/primitives';
import type { VibesEntitlements, VibesProduct, VibesWallet } from './types';

/** Presentation only. Every number below comes from the wallet, never from here. */
export const planNames: Record<string, string> = { free: 'Free', starter: 'Starter', builder: 'Builder', pro: 'Pro' };
const order = ['free', 'starter', 'builder', 'pro'];
export const planRank = (plan: string) => Math.max(0, order.indexOf(plan));

export interface Benefit { icon: IconName; label: string; detail?: string; status?: string }

const count = (value: number) => value.toLocaleString();
const projects = (limit: number | null) =>
  limit === null ? 'Unlimited projects' : `${limit} ${limit === 1 ? 'project' : 'projects'} at a time`;

/**
 * The benefits of one offer, in the order they matter to someone deciding.
 * `status` marks an entitlement that is included but not yet usable, so the
 * screen can never imply a capability the backend has not switched on.
 */
export function benefitsFor(product: VibesProduct, wallet: VibesWallet): Benefit[] {
  const plan = product.plan ?? 'free';
  const e: VibesEntitlements = wallet.planEntitlements[plan] ?? wallet.entitlements;
  const list: Benefit[] = [
    { icon: 'sparkles-outline', label: `${count(product.credits)} Vibes every month`, detail: 'Unused Vibes roll over while you subscribe.' },
    { icon: e.fullCatalogue ? 'layers-outline' : 'color-wand-outline',
      label: e.fullCatalogue ? 'Every model on OpenRouter' : 'Every Vibyra model',
      detail: e.fullCatalogue ? 'The full provider catalogue, priced per use.' : 'The curated set, from fast to frontier.' },
    { icon: 'folder-open-outline', label: projects(e.maxProjects), detail: 'Vibyra reads and edits real files, with your approval.' },
  ];
  if (e.concurrentReplies > 1) list.push({ icon: 'flash-outline', label: `${e.concurrentReplies} replies at once`, detail: 'Keep more than one idea moving.' });
  if (e.remoteAccess) list.push({ icon: 'desktop-outline', label: 'Remote access to your computer',
    detail: 'Pair over your own network today.', status: wallet.remoteAccessLive ? undefined : 'Coming soon' });
  return list;
}

/** What this offer adds over the plan the account already has. */
export function upgradeSummary(product: VibesProduct, wallet: VibesWallet): string | null {
  const plan = product.plan ?? 'free';
  if (planRank(plan) <= planRank(wallet.plan)) return null;
  const e = wallet.planEntitlements[plan] ?? wallet.entitlements;
  return e.fullCatalogue ? 'Everything, unlimited' : `${count(product.credits)} Vibes a month`;
}

/** Subscriptions worth offering, cheapest first, with the current plan removed. */
export function offers(wallet: VibesWallet | null): VibesProduct[] {
  return (wallet?.products ?? []).filter(p => p.kind === 'subscription' && planRank(p.plan ?? 'free') > planRank(wallet?.plan ?? 'free'))
    .sort((a, b) => planRank(a.plan ?? 'free') - planRank(b.plan ?? 'free'));
}

/** Default the picker to the middle offer; a single remaining offer selects itself. */
export function defaultOffer(available: VibesProduct[]): string | null {
  if (available.length === 0) return null;
  return available[Math.min(1, available.length - 1)].plan;
}
