import type { NearbyComputer } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';

// Long enough for a busy phone to answer, short enough that a silent address
// does not hold up the sweep.
const TIMEOUT = 1200;

/** Asks one address whether a discoverable Vibyra Host is there.
 *
 *  A reply only counts when it is the presence document such a Host serves,
 *  carrying an identity the transport can pin. Anything else — a 404 from a
 *  private Host, some other service, a timeout — is simply not a computer. */
export async function probeIdentity(host: string, port: number,
  signal: AbortSignal): Promise<NearbyComputer | undefined> {
  if (signal.aborted) return undefined;
  const timer = new AbortController();
  const deadline = setTimeout(() => timer.abort(), TIMEOUT);
  const cancel = () => timer.abort();
  signal.addEventListener('abort', cancel);
  try {
    const address = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    const response = await fetch(`http://${address}:${port}/identity`,
      { signal: timer.signal, redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) return undefined;
    const value = await response.json() as { version?: number; id?: unknown; name?: unknown };
    if (value.version !== 1 || typeof value.id !== 'string' || !/^[a-f0-9]{64}$/.test(value.id)) {
      return undefined;
    }
    // Keyed by identity, not by address: one computer is one computer however
    // many of its addresses or ports answer. An unnamed Host is "Computer",
    // never its address — nobody recognises their Mac by an IP.
    const named = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined;
    const computer: NearbyComputer = { id: value.id, name: named ? named.slice(0, 128) : 'Computer',
      hostId: value.id, host: address, port };
    return !signal.aborted && isConnectable(computer) ? computer : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', cancel);
  }
}
