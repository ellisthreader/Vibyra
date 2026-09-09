import type { NetworkKind } from './discoveryTypes';

const labels: Record<NetworkKind, string> = {
  wifi: 'WI-FI', direct: 'DIRECT', wired: 'ETHERNET', shared: 'SHARED',
  vpn: 'VPN', other: 'NETWORK', cellular: 'CELLULAR',
};

/** The link a computer answered on, for the tag on its card. Absent when the
 *  browse did not report an interface, rather than guessed at. */
export function viaLabel(via?: NetworkKind): string | undefined {
  return via ? labels[via] : undefined;
}
