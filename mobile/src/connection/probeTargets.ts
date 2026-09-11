/** Where a build without Bonjour should look for a Host.
 *
 *  Two different things, deliberately kept apart:
 *
 *  - The addresses this phone is *already* talking to are asked directly. That
 *    includes both loopback families, where the Host is on the machine running
 *    an iOS Simulator, and known LAN IPv6 addresses. Only endpoints the pairing
 *    parser supports are useful; a CLAT shim is not a computer address.
 *  - Widening to a whole /24 only happens for a real private range, so the
 *    internet is never swept and a point-to-point link is not expanded. */
export const PROBE_PORTS = [4318, 4319];
export const LOOPBACK = '127.0.0.1';
export const LOOPBACK_V6 = '[::1]';
/** Ranges a /24 sweep is reasonable on. */
const PRIVATE = /^(?:10(?:\.\d{1,3}){2}|192\.168\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3})\.\d{1,3}$/;
/** Ranges that are never the public internet, so they are safe to ask directly. */
const LOCAL = /^(?:127(?:\.\d{1,3}){2}|169\.254\.\d{1,3})\.\d{1,3}$/;

export interface ProbePlan {
  /** What to tell the person we are searching: a subnet, an address, or "this
   *  computer" when loopback is all there is — which is what a Simulator sees,
   *  and where the Host really is in that case. */
  scope: string;
  hosts: string[];
}
export const THIS_COMPUTER = 'this computer';

export const isPrivate = (address: string) => PRIVATE.test(address);
export const isProbeable = (address: string) => PRIVATE.test(address) || LOCAL.test(address);

/** Known IPv6 endpoints are asked directly, never swept. Keep their brackets
 *  all the way through HTTP discovery and the encrypted WebSocket connection. */
export function probeAddress(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  const bareV6 = /^[\da-f:]+$/i.test(trimmed) && trimmed.split(':').length > 2;
  const authority = trimmed.replace(/^[\w+.-]+:\/\//, '').split('/')[0];
  const numeric = authority.split(':')[0];
  if (!bareV6 && /^[\d.]+$/.test(numeric) && (numeric.split('.').length !== 4
    || numeric.split('.').some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255))) return undefined;
  const candidate = safeHost(trimmed.includes('://') ? trimmed
    : `http://${bareV6 ? `[${trimmed}]` : trimmed}`);
  if (!candidate) return undefined;
  if (candidate === LOOPBACK_V6 || /^\[(?:[23][\da-f]{3}:|f[cd][\da-f]{2}:)/i.test(candidate)) {
    return candidate;
  }
  const parts = candidate.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return undefined;
  return isProbeable(candidate) ? candidate : undefined;
}

/** The plan: known addresses first, then the rest of their /24 when that range
 *  is private. Loopback is always included, so a Simulator finds the Host on
 *  the machine running it without any configuration. */
export function probePlan(known: (string | undefined | null)[]): ProbePlan | undefined {
  const hosts: string[] = [];
  const add = (address: string) => { if (!hosts.includes(address)) hosts.push(address); };
  for (const value of known) {
    const address = probeAddress(value);
    if (address) add(address);
  }
  add(LOOPBACK);
  add(LOOPBACK_V6);
  const sweepable = hosts.find(isPrivate);
  if (!sweepable) {
    const direct = hosts.filter(address => address !== LOOPBACK && address !== LOOPBACK_V6);
    return { scope: direct.length ? direct[0] : THIS_COMPUTER, hosts };
  }
  const subnet = sweepable.split('.').slice(0, 3).join('.');
  for (let last = 1; last <= 254; last += 1) add(`${subnet}.${last}`);
  return { scope: `${subnet}.×`, hosts };
}

function safeHost(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    return url.hostname;
  } catch { return undefined; }
}
