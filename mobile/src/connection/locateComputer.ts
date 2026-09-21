import { parsePairing, type Pairing } from '../transport/pairing';
import type { DiscoveryAdapter, NearbyComputer } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';

/** Long enough for Bonjour to resolve, or for the address that served this app
 *  to answer; short enough that a computer that really is off is reported
 *  without a long wait on every rung of the reconnect ladder. */
const LOOK = 6000;
/** A search in one of these states will not turn anything else up. */
const OVER = new Set(['finished', 'failed', 'denied', 'unavailable']);

/** Looks on whatever network this phone is on now for one computer: the one
 *  whose key the saved connection is pinned to. The key only says where to
 *  try. The Noise handshake still has to prove it, so anything else answering
 *  to that key gets no further than a refused connection. */
export function locateComputer(adapter: DiscoveryAdapter, publicKey: string,
  timeout = LOOK): Promise<NearbyComputer | undefined> {
  return new Promise(resolve => {
    let done = false;
    let stop: (() => void) | undefined;
    const finish = (computer?: NearbyComputer) => {
      if (done) return;
      done = true; clearTimeout(timer); stop?.(); resolve(computer);
    };
    const timer = setTimeout(() => finish(), timeout);
    stop = adapter.start(update => {
      const match = update.computers.find(computer => computer.hostId === publicKey && isConnectable(computer));
      if (match || OVER.has(update.status)) finish(match);
    });
    // The adapter may have answered before it handed back its stop.
    if (done) stop();
  });
}

/** The same trusted computer, at the address it answers on now. Everything the
 *  phone pinned stays as it was; only where to find it changes, and that goes
 *  through the checks any pairing does. A computer found by searching is on
 *  this network by construction, which is what `direct` and `lan` declare. */
export function movedPairing(pairing: Pairing, computer: NearbyComputer): Pairing {
  return parsePairing(JSON.stringify({ ...pairing, url: `ws://${computer.host}:${computer.port}`,
    route: 'direct', network: 'lan' }));
}
