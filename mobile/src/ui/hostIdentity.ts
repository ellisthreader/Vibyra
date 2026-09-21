import type { IconName } from './primitives';

/** What a computer is, and where it is, from the two things the phone actually
 *  knows: the platform string the Host reports and the address in the pairing.
 *  Nothing here asks the network; `hostLocation.ts` turns `locationLookup`'s
 *  answer into a place, and `describeLocation` is what is said without one. */
export interface HostPlatform { icon: IconName; label: string }

// The Host sends `std::env::consts::OS`, so the wire values are lowercase
// ("macos", "windows", "linux"); older saves and the sample workspace carry
// display casing and their own trailing detail. `match` picks the logo loosely;
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

/** The logo alone, for drawing a computer whose family is known — and nothing
 *  for one that is not, so a drawing can leave the platform out rather than
 *  wear a generic mark. */
export function platformLogo(platform?: string): IconName | undefined {
  const { icon } = describePlatform(platform);
  return icon === 'desktop-outline' ? undefined : icon;
}

/** The family of a computer that has not said it — a Host built before the
 *  advertisement carried one — read from what it did say: a name like
 *  “Elliss-MacBook-Air” or “DESKTOP-4F2K1” is how its own OS named it, and a
 *  computer answering at this device's own address is the Mac the Simulator
 *  runs on. Only unmistakable patterns count; a name that could be anything
 *  gives nothing, because a wrong logo is worse than none. */
export function guessPlatform(name: string, host?: string): string | undefined {
  if (/\b(mac ?book|i ?mac|mac ?(mini|studio|pro)|macos)\b/i.test(name)) return 'macos';
  if (/^(desktop|laptop)-[a-z0-9]{5,}$/i.test(name.trim()) || /\bwindows\b/i.test(name)) return 'windows';
  if (/\b(linux|ubuntu|debian|fedora|arch ?linux|nixos|raspberry ?pi|raspberrypi)\b/i.test(name)) return 'linux';
  return host && onThisDevice(host) ? 'macos' : undefined;
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

/** The address as a person reads it: the IP alone. The brackets around IPv6 are
 *  URL syntax, not part of the address, and the port is not something anyone
 *  acts on — and with the brackets gone a trailing port would read as more IPv6. */
export function displayAddress(address: string): string {
  return splitAddress(address).host.replace(/^\[|\]$/g, '');
}

const bare = (address: string) => displayAddress(address).toLowerCase();

/** A loopback address: the computer is the very device the app runs on — the
 *  iOS Simulator or a browser on the Mac itself. `::1` is true there, and says
 *  nothing about where that computer is on any network. */
export function onThisDevice(address: string): boolean {
  const host = bare(address);
  return host === '::1' || /^127\./.test(host) || host === 'localhost';
}

/** Which network the computer answers on. Derived from the address alone: a
 *  10/172.16/192.168 or unique-local address is by definition on this network,
 *  and anything else is honestly reported as outside it rather than guessed. */
export function describeLocation(address: string): string {
  const host = bare(address);
  if (onThisDevice(address)) return 'This device';
  if (/^169\.254\./.test(host) || host.startsWith('fe80:')) return 'Direct link';
  if (/^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'Local network';
  if (/^f[cd]/.test(host) || host.endsWith('.local')) return 'Local network';
  return 'Outside your network';
}

/** Whose public address says where the computer is. A private address has no
 *  geography, but a computer on this phone's own network reaches the internet
 *  through the same public address the phone does, so the phone asks about
 *  itself (`self`). An IP reached from outside is asked about directly, and a
 *  name is neither, so nothing is looked up for it. */
export function locationLookup(address: string): string | null {
  if (describeLocation(address) !== 'Outside your network') return 'self';
  const host = bare(address);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || (/^[\da-f:]+$/.test(host) && host.includes(':')) ? host : null;
}
