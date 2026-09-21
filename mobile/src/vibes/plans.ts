import type { IconName } from '../ui/primitives';
import type { VibesEntitlements, VibesProduct, VibesWallet, VibesWindow } from './types';

/**
 * Presentation only. Every number below comes from the wallet, never from here.
 *
 * Builder and Pro are sold as two sizes of Pro, "Pro 10×" and "Pro 20×", a naming
 * the user chose on 2026-09-11. The multiples are names, not measurements: they
 * read as tenfold and twentyfold 100 Vibes a month, and nothing in the wallet is
 * 100 Vibes, so they are not computed from it. Change an allowance and rename here
 * on purpose. App Store Connect keeps its own product names for Apple's sheet.
 */
export const planNames: Record<string, string> = { free: 'Free', starter: 'Starter', builder: 'Pro 10×', pro: 'Pro 20×' };
/** The tab each size of Pro is chosen by on the upgrade page. */
export const planSizes: Record<string, string> = { builder: '10×', pro: '20×' };
const order = ['free', 'starter', 'builder', 'pro'];
export const planRank = (plan: string) => Math.max(0, order.indexOf(plan));

/** One entitlement, said once, with the glyph it is recognised by elsewhere in
 *  the app. `status` is the only thing that ever qualifies it. `id` names the row
 *  across plans, and a figure of Vibes also carries `amount` and `unit`, so a page
 *  switching plans can roll the figure instead of replacing the line. */
export interface Benefit { id: string; icon: IconName; label: string; status?: string; amount?: number; unit?: string }

const count = (value: number) => value.toLocaleString();
const projects = (limit: number | null) =>
  limit === null ? 'Unlimited projects' : `${limit} ${limit === 1 ? 'project' : 'projects'} at a time`;
/**
 * "5 hours". A window's own length is read from the wallet, never written here:
 * the backend owns how long it looks back, and a client that keeps its own copy
 * starts lying the first time that is retuned.
 */
export const spanOf = (window: VibesWindow) =>
  window.span === 1 ? window.unit.slice(0, -1) : `${window.span} ${window.unit}`;

/**
 * The benefits of one offer, in the order they matter to someone deciding. Each
 * is a short entitlement label and nothing else: the page lists them under a
 * price, so a second explanatory line only repeats what the label already says.
 *
 * `status` marks an entitlement that is included but not yet usable, so the
 * screen can never imply a capability the backend has not switched on.
 */
export function benefitsFor(product: VibesProduct, wallet: VibesWallet): Benefit[] {
  const plan = product.plan ?? 'free';
  const e: VibesEntitlements = wallet.planEntitlements[plan] ?? wallet.entitlements;
  // The whole OpenRouter catalogue is on every plan, so naming it here would list
  // a reason to upgrade that upgrading does not change. It earns a row only while
  // some plan is actually without it, which keeps this honest by itself if the
  // entitlement ever narrows again.
  const catalogueSells = Object.values(wallet.planEntitlements ?? {}).some(plan => !plan.fullCatalogue);
  const vibes = (id: string, icon: IconName, amount: number, unit: string): Benefit =>
    ({ id, icon, label: `${count(amount)}${unit}`, amount, unit });
  const list: Benefit[] = [
    vibes('monthly', 'sparkles-outline', product.credits, ' Vibes every month'),
    ...(catalogueSells ? [{ id: 'catalogue', icon: (e.fullCatalogue ? 'layers-outline' : 'color-wand-outline') as IconName,
      label: e.fullCatalogue ? 'Choose from more AI models' : 'Choose your Vibyra AI model' }] : []),
    { id: 'projects', icon: 'folder-open-outline', label: projects(e.maxProjects) },
  ];
  if (planSizes[plan]) list.push({ id: 'features', icon: 'apps-outline', label: 'All Pro features included' });
  list.push({ id: 'rollover', icon: 'refresh-outline', label: 'Unused paid Vibes roll over' });
  // How fast the plan may spend, which is the entitlement a heavy week actually
  // meets. The window's length comes from the wallet, so a backend that publishes
  // none leaves the row off rather than inviting a guessed "5 hours" in here.
  if (wallet.limits) list.push(vibes('rate', 'speedometer-outline', e.sessionCredits, ` Vibes per ${spanOf(wallet.limits.session)}`));
  if (e.remoteAccess && wallet.remoteAccessLive) list.push({ id: 'remote', icon: 'desktop-outline',
    label: 'Build on your computer remotely' });
  return list;
}

/*
 * There is deliberately no free-grant constant here any more. Plans used to be
 * headlined as a multiple of it - "3.5× usage" for Starter against 100 free Vibes
 * - which only reads as a number while the grant is large enough to be a unit of
 * work. Against a trial of a few Vibes the same arithmetic prints "117×", which
 * says nothing about what a plan buys and quietly advertises that the free tier is
 * worthless. The first bullet states the allowance itself instead, which is the
 * figure the wallet publishes and the backend grants.
 */

/** Subscriptions worth offering, cheapest first, with the current plan removed. */
export function offers(wallet: VibesWallet | null): VibesProduct[] {
  return (wallet?.products ?? []).filter(p => p.kind === 'subscription' && planRank(p.plan ?? 'free') > planRank(wallet?.plan ?? 'free'))
    .sort((a, b) => planRank(a.plan ?? 'free') - planRank(b.plan ?? 'free'));
}

/** The sizes of Pro an account can still move up to, smallest first. Starter is not one. */
export function sizesOf(available: VibesProduct[]): VibesProduct[] {
  return available.filter(p => planSizes[p.plan ?? '']);
}

/** The size the upgrade page opens on: the top one. */
export function defaultOffer(available: VibesProduct[]): string | null {
  return available.at(-1)?.plan ?? null;
}

/** One thing an upgrade actually changes, from what the account has today. */
export interface PlanChange { label: string; from: string; to: string; pending?: boolean }

const limit = (value: number | null) => value === null ? 'Unlimited' : String(value);
const allowance = (wallet: VibesWallet) =>
  wallet.products.find(p => p.kind === 'subscription' && p.plan === wallet.plan)?.credits ?? 0;

/**
 * What buying this plan changes, and nothing that stays the same. A feature list
 * cannot answer "is this worth it" because it never says what you have now; a
 * difference can, and it prunes itself — an entitlement the upgrade does not move
 * is not a reason to upgrade, so it earns no row.
 *
 * Both sides come from the wallet: `entitlements` is the account's own, and
 * `planEntitlements` is the offer's.
 */
export function changesFor(product: VibesProduct, wallet: VibesWallet): PlanChange[] {
  const now = wallet.entitlements;
  const next = wallet.planEntitlements[product.plan ?? ''] ?? now;
  const held = allowance(wallet);
  const changes: PlanChange[] = [];
  if (product.credits !== held) changes.push({ label: 'Vibes each month',
    from: held ? count(held) : 'None', to: count(product.credits) });
  if (next.maxProjects !== now.maxProjects)
    changes.push({ label: 'Projects at once', from: limit(now.maxProjects), to: limit(next.maxProjects) });
  if (next.concurrentReplies !== now.concurrentReplies)
    changes.push({ label: 'Replies at once', from: String(now.concurrentReplies), to: String(next.concurrentReplies) });
  // The windows are the reason a busy week upgrades, so they earn a row whenever
  // they move - and prune themselves like every other line when they do not.
  if (wallet.limits && next.sessionCredits !== now.sessionCredits)
    changes.push({ label: `Vibes every ${spanOf(wallet.limits.session)}`,
      from: count(now.sessionCredits), to: count(next.sessionCredits) });
  if (wallet.limits && next.weekCredits !== now.weekCredits)
    changes.push({ label: `Vibes every ${spanOf(wallet.limits.week)}`,
      from: count(now.weekCredits), to: count(next.weekCredits) });
  if (next.fullCatalogue && !now.fullCatalogue)
    changes.push({ label: 'Models', from: 'Curated', to: 'All of OpenRouter' });
  if (next.remoteAccess && !now.remoteAccess) changes.push({ label: 'Your computer',
    from: 'Same network', to: 'From anywhere', pending: !wallet.remoteAccessLive });
  return changes;
}
