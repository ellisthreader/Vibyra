import { useEffect, useState } from 'react';
import { locationLookup } from './hostIdentity';

// GeoJS: free, keyless, HTTPS, and it answers browsers too. For an address it
// cannot place (a private one, a carrier's shared range) its reply simply has no
// city or country, which the page treats the same as no reply at all.
const SERVICE = 'https://get.geojs.io/v1/ip/geo';
const TIMEOUT = 6000;
// Where a computer is does not change while you look at it, so an answer is kept
// for the address it was found for; a miss is not kept, so it is asked again.
const FRESH = 30 * 60 * 1000;
const known = new Map<string, { at: number; found: Promise<Whereabouts | null> }>();

/** What the lookup says about where the computer is: roughly the place, and
 *  the public address it saw. For a computer on this very device — the iOS
 *  Simulator on the Mac it runs on — that public address is the only real one
 *  the phone can name, since the connection itself is loopback. */
export interface Whereabouts {
  place: string | null;
  ip: string | null;
}

/** "City, Country" from a lookup reply, the country alone when that is all it
 *  knows, and null when it knows neither. */
export function placeOf(reply: unknown): string | null {
  const { city, country } = (reply ?? {}) as { city?: unknown; country?: unknown };
  const clean = (part: unknown) => (typeof part === 'string' ? part.trim() : '');
  if (!clean(country)) return null;
  return [clean(city), clean(country)].filter(Boolean).join(', ');
}

/** The public IP a lookup reply names, only if it is shaped like one. */
export function ipOf(reply: unknown): string | null {
  const { ip } = (reply ?? {}) as { ip?: unknown };
  if (typeof ip !== 'string' || ip.length > 45) return null;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || (/^[\da-f:]+$/i.test(ip) && ip.includes(':'))
    ? ip
    : null;
}

/** Roughly where the computer at `address` is — city-level at best, since an
 *  IP only says where its network meets the internet. Null when nothing could say. */
export async function lookUp(
  address: string,
  request: typeof fetch = fetch,
): Promise<Whereabouts | null> {
  const target = locationLookup(address);
  if (!target) return null;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await request(
      target === 'self' ? `${SERVICE}.json` : `${SERVICE}/${target}.json`,
      { signal: controller.signal, headers: { accept: 'application/json' } },
    );
    if (!response.ok) return null;
    const reply: unknown = await response.json();
    const found = { place: placeOf(reply), ip: ipOf(reply) };
    return found.place || found.ip ? found : null;
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

function lookUpOnce(address: string) {
  const kept = known.get(address);
  if (kept && Date.now() - kept.at < FRESH) return kept.found;
  const found = lookUp(address);
  known.set(address, { at: Date.now(), found });
  void found.then((answer) => {
    if (!answer) known.delete(address);
  });
  return found;
}

/** Where the computer is: undefined while asking, null when nothing could say. */
export function useWhereabouts(address: string): Whereabouts | null | undefined {
  const [found, setFound] = useState<{ address: string; answer: Whereabouts | null }>();
  useEffect(() => {
    let current = true;
    void lookUpOnce(address).then((answer) => {
      if (current) setFound({ address, answer });
    });
    return () => {
      current = false;
    };
  }, [address]);
  return found?.address === address ? found.answer : undefined;
}
