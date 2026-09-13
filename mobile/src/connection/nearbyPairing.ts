import { parsePairing } from '../transport/pairing';
import type { NearbyComputer } from './discoveryTypes';

/** A discovered computer is only connectable once Bonjour gave us its identity
 *  and Apple resolved a routable address. Until then the card stays inert
 *  instead of failing a connection the person already believes started. */
export function isConnectable(computer: NearbyComputer): computer is Required<NearbyComputer> {
  if (!hasEndpoint(computer)) return false;
  try { parsePairing(pairingPayload(computer)); return true; } catch { return false; }
}

function hasEndpoint(computer: NearbyComputer) {
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
  if (!hasEndpoint(computer)) {
    throw new Error('This computer has not finished announcing its address. Try again in a moment.');
  }
  const link = pairingPayload(computer);
  parsePairing(link);
  return link;
}

function pairingPayload(computer: NearbyComputer): string {
  return JSON.stringify({
    version: 1, hostId: computer.hostId, name: computer.name, publicKey: computer.hostId,
    url: `ws://${computer.host}:${computer.port}`, route: 'direct', network: 'lan', nearby: true,
  });
}
