import type { NearbyComputer } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';

/** Once someone is asked to confirm a computer, transient browse gaps must not
 * withdraw the question. A fresh, usable address for the same pinned key wins
 * over the last one, including when other computers arrive meanwhile. */
export function confirmedComputer(
  held: NearbyComputer | null,
  computers: NearbyComputer[],
  single: NearbyComputer | null,
): NearbyComputer | null {
  if (!held) return single;
  return computers.find(computer => computer.hostId === held.hostId && isConnectable(computer)) ?? held;
}

export const sameComputer = (a: NearbyComputer, b: NearbyComputer) => a.id === b.id
  && a.name === b.name && a.hostId === b.hostId && a.host === b.host
  && a.port === b.port && a.platform === b.platform;
