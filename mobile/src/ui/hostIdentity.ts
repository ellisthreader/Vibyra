import type { IconName } from './primitives';

/** What a computer is, and where it is, from the two things the phone actually
 *  knows: the platform string the Host reports and the address in the pairing.
 *  Nothing here asks the network — a private address has no geography, so
 *  "location" means which network answers, never a place on a map. */
export interface HostPlatform { icon: IconName; label: string }

// The Host sends `std::env::consts::OS`, so the wire values are lowercase
// ("macos", "windows", "linux"); older saves and the sample workspace carry
// display casing and their own trailing detail, and a pairing restored before
// `host.state` arrives says only "Computer". `match` picks the logo loosely;
// `wire` is the bare machine value, and only that is worth relabelling — what a
// computer says about itself beyond it ("Windows 11", "· x86_64") is kept.
const families: { icon: IconName; label: string; match: RegExp; wire: RegExp }[] = [
  { icon: 'logo-apple', label: 'macOS', match: /mac|darwin|apple|os ?x/i, wire: /^(macos|mac ?os ?x?|darwin|apple)$/i },
  { icon: 'logo-windows', label: 'Windows', match: /win/i, wire: /^win(dows)?$/i },
  { icon: 'logo-tux', label: 'Linux', match: /linux|tux|ubuntu|debian|fedora|arch/i, wire: /^linux$/i },
];

export function describePlatform(platform?: string): HostPlatform {
  const value = platform?.trim();
  if (!value) return { icon: 'desktop-outline', label: 'Computer' };
  const [head, ...rest] = value.split('·').map(part => part.trim());
  for (const family of families) {
    if (!family.match.test(head)) continue;
    return { icon: family.icon, label: [family.wire.test(head) ? family.label : head, ...rest].join(' · ') };
  }
  return { icon: 'desktop-outline', label: value };
}

/** Splits `host:port` as the pairing URL wrote it. IPv6 keeps its brackets, so
 *  the port is whatever follows the last colon outside them. */
export function splitAddress(address: string): { host: string; port?: string } {
  const value = address.trim();
  const closing = value.lastIndexOf(']');
  const colon = value.lastIndexOf(':');
  if (colon <= closing || colon < 0) return { host: value };
  return { host: value.slice(0, colon), port: value.slice(colon + 1) || undefined };
}

/** Which network the computer answers on. Derived from the address alone: a
 *  10/172.16/192.168 or unique-local address is by definition on this network,
 *  and anything else is honestly reported as outside it rather than guessed. */
export function describeLocation(address: string): string {
  const host = splitAddress(address).host.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === '::1' || /^127\./.test(host) || host === 'localhost') return 'This device';
  if (/^169\.254\./.test(host) || host.startsWith('fe80:')) return 'Direct link';
  if (/^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'Local network';
  if (/^f[cd]/.test(host) || host.endsWith('.local')) return 'Local network';
  return 'Outside your network';
}
