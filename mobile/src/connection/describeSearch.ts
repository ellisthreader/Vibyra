import type { NearbyComputer, SearchNetwork } from './discoveryTypes';

/** The words for each state of the search. Two-line titles with an accented
 *  second line match the setup page, and every line states only what is true:
 *  Bonjour covers the links this phone is on, never a computer past a router. */
export function describeSearch({ unavailable, denied, status, computers, only, elapsed, networks }: {
  unavailable: boolean; denied: boolean; status: string; computers: NearbyComputer[];
  only: NearbyComputer | null; elapsed: number; networks: SearchNetwork[];
}): { lead: string; accent: string; detail: string } {
  if (unavailable) {
    return { lead: 'Searching needs', accent: 'the app',
      detail: 'This preview cannot reach your networks. Open the Vibyra app on your iPhone and it finds your computer by itself.' };
  }
  if (denied) {
    return { lead: 'Local network', accent: 'is off',
      detail: 'iOS is blocking Vibyra from seeing your networks. Turn on Local Network for Vibyra in Settings, then search again.' };
  }
  if (only) {
    return { lead: 'Found', accent: only.name,
      detail: `Reached over ${linkName(only.via)}. Starting the encrypted connection…` };
  }
  if (computers.length > 1) {
    return { lead: 'Choose your', accent: 'computer',
      detail: `${computers.length} computers answered on your networks.` };
  }
  if (computers.length === 1) {
    return { lead: 'Found', accent: computers[0].name,
      detail: 'Waiting for it to announce an address we can connect to.' };
  }
  if (status === 'finished') {
    return { lead: 'Nothing', accent: 'answered',
      detail: 'Open Vibyra Host or Vibyra Desktop on your computer and bring it onto one of these networks, then search again.' };
  }
  if (status === 'failed') {
    return { lead: 'The search', accent: 'stopped',
      detail: 'Your network refused the search. Check the connection, then try again.' };
  }
  return { lead: 'Searching your', accent: 'networks', detail: searching(elapsed, networks) };
}

function searching(elapsed: number, networks: SearchNetwork[]): string {
  const searched = networks.filter(network => network.searched);
  if (!networks.length) return 'Looking for a network to search. Allow local network access when iOS asks.';
  if (!searched.length) {
    return 'None of your current networks can be searched. Join Wi-Fi, or connect to your computer directly.';
  }
  const links = searched.map(network => network.label);
  const list = links.length === 1 ? links[0]
    : `${links.slice(0, -1).join(', ')} and ${links[links.length - 1]}`;
  return elapsed > 9
    ? `Still listening on ${list}. Keep Vibyra Host open on your computer.`
    : `Listening on ${list} at the same time. Nothing to type.`;
}

function linkName(via?: string): string {
  const names: Record<string, string> = { wifi: 'Wi-Fi', direct: 'a direct link', wired: 'Ethernet',
    shared: 'a shared network', vpn: 'your VPN', other: 'your network', cellular: 'cellular' };
  return (via && names[via]) ?? 'your network';
}
