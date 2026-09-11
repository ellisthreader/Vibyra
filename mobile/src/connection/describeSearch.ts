import type { NearbyComputer } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';

/** The words for each state of the search.
 *
 *  Named for what someone is doing, never for how the search works: no
 *  addresses, ports, subnets or pass counts reach the screen. One plain title
 *  and one plain line under it — the words are the whole design. */
export function describeSearch({ unavailable, denied, status, computers, only, elapsed }: {
  unavailable: boolean; denied: boolean; status: string;
  computers: NearbyComputer[]; only: NearbyComputer | null; elapsed: number;
}): { title: string; detail: string } {
  if (unavailable) {
    return { title: 'Join a Wi-Fi network',
      detail: 'Vibyra needs to be on the same Wi-Fi as your computer to find it.' };
  }
  if (denied) {
    return { title: 'Allow local network access',
      detail: 'iOS is blocking Vibyra from seeing your Wi-Fi. Turn on Local Network for Vibyra in Settings, then look again.' };
  }
  if (only) return { title: `Found ${only.name}`, detail: 'Connecting…' };
  if (computers.length > 1) {
    return { title: 'Choose your computer',
      detail: `${computers.filter(isConnectable).length} ready to connect. Choose the computer you want to use.` };
  }
  if (computers.length === 1) {
    return { title: `Found ${computers[0].name}`, detail: status === 'finished' || status === 'failed'
      ? 'This computer did not become available. Check that iPhone connection is on, then search again.' : 'Getting it ready…' };
  }
  if (status === 'finished') {
    return { title: 'No computer found',
      detail: 'Open Vibyra on your computer and turn on iPhone connection, then look again. Both devices need the same Wi-Fi.' };
  }
  if (status === 'failed') {
    return { title: 'Could not look for computers', detail: 'Check your Wi-Fi connection, then try again.' };
  }
  return { title: 'Looking for your computer',
    detail: elapsed > 10
      ? 'On your computer, open Settings → iPhone connection and turn it on. Keep both devices on the same Wi-Fi.'
      : 'Keep Vibyra open on your computer, with iPhone connection turned on.' };
}
