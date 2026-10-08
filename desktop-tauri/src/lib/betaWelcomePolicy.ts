import type { AccountProfile } from '../accountTypes';

export interface BetaReceipt { scope: string; id: string; months: number | null; endsAt: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE = 'vibyra.betaWelcome.dismissed.v1';
const memory = new Map<string, 'pending' | 'synced'>();
const key = (receipt: BetaReceipt) => `${receipt.scope}:${receipt.id}`;

export function betaReceipt(profile: AccountProfile | null, now = Date.now()): BetaReceipt | null {
  const license = profile?.license, welcome = license?.betaWelcome;
  if (!profile?.emailVerified || !profile.welcomeKey || !license || !welcome || !UUID.test(welcome.id)
    || !(Date.parse(license.endsAt) > now) || (welcome.months !== null
      && (!Number.isInteger(welcome.months) || welcome.months < 1 || welcome.months > 36))) return null;
  return { scope: profile.welcomeKey, id: welcome.id, months: welcome.months, endsAt: license.endsAt };
}

export function betaOffer(months: number | null): string {
  return months === 1 ? 'One month of Pro. On us.'
    : months ? `${months} months of Pro. On us.` : 'Complimentary Pro. Just for you.';
}

export function dismissal(receipt: BetaReceipt): 'pending' | 'synced' | undefined {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    if (Array.isArray(entries)) for (const item of entries.slice(-100)) {
      if (Array.isArray(item) && typeof item[0] === 'string' && item[0].length < 160
        && (item[1] === 'pending' || item[1] === 'synced')) memory.set(item[0], item[1]);
    }
  } catch { /* Private storage can be unavailable; this session still remembers. */ }
  return memory.get(key(receipt));
}

export function rememberBeta(receipt: BetaReceipt, state: 'pending' | 'synced'): void {
  dismissal(receipt);
  memory.delete(key(receipt));
  memory.set(key(receipt), state);
  while (memory.size > 100) memory.delete(memory.keys().next().value!);
  try { localStorage.setItem(STORAGE, JSON.stringify([...memory])); } catch { /* Session fallback. */ }
}
