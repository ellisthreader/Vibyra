import { parsePairing } from '../transport/pairing';
import type { NearbyComputer } from './discoveryTypes';

/** A discovered computer is only connectable once Bonjour gave us its identity
 *  and Apple resolved a routable address. Until then the card stays inert
 *  instead of failing a connection the person already believes started. */
export function isConnectable(computer: NearbyComputer): computer is Required<NearbyComputer> {
  return typeof computer.hostId === 'string' && /^[a-f0-9]{64}$/.test(computer.hostId)
    && typeof computer.host === 'string' && computer.host.length > 0
    && typeof computer.port === 'number' && Number.isInteger(computer.port)
    && computer.port > 0 && computer.port <= 65535;
}

/** Builds the pairing for a discovered computer and runs it through the same
 *  validation a scanned code gets, so discovery cannot widen what the phone
 *  will connect to. The Host static public key is its `hostId`; there is no
 *  invitation, so the computer must approve this phone locally instead. */
export function nearbyPairingLink(computer: NearbyComputer): string {
  if (!isConnectable(computer)) {
    throw new Error('This computer has not finished announcing its address. Try again in a moment.');
  }
  const link = JSON.stringify({
    version: 1, hostId: computer.hostId, name: computer.name, publicKey: computer.hostId,
    url: `ws://${computer.host}:${computer.port}`, route: 'direct', network: 'lan', nearby: true,
  });
  parsePairing(link);
  return link;
}

/** A stable starting angle for a set of computers. Hashing alone cannot keep
 *  two names apart, so it only decides where the arrangement begins. */
export function radarAngle(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) % 3600) / 10;
}

/** Spreads the computers found around the radar face. Angles are decorative,
 *  never a real bearing; the same set always lays out identically, so the
 *  repeated updates of a live search never make the blips jitter. */
export function radarAngles(ids: string[]): number[] {
  if (!ids.length) return [];
  const base = radarAngle(ids[0]);
  const step = 360 / ids.length;
  return ids.map((_, index) => (base + index * step) % 360);
}
