import type { DiscoveryAdapter, DiscoveryUpdate, NearbyComputer, SearchNetwork } from '../src/connection/discoveryTypes';

// Stands in for the native Bonjour module so the search, found and blocked
// screens can be inspected in a browser. It only replays scripted updates: no
// network access, and the shapes match what ComputerBrowser.swift emits.
const key = (pair: string) => pair.repeat(32);
// The links a phone commonly has at once: current Wi-Fi, a private VPN and
// Apple peer-to-peer, plus cellular which cannot be searched.
const links: SearchNetwork[] = [
  { id: 'en0', kind: 'wifi', label: 'Wi-Fi', searched: true },
  { id: 'awdl0', kind: 'direct', label: 'Direct', searched: true },
  { id: 'utun3', kind: 'vpn', label: 'VPN', searched: true },
  { id: 'pdp_ip0', kind: 'cellular', label: 'Cellular', searched: false },
];
const offline: SearchNetwork[] = [links[3]];
const studio: NearbyComputer = { id: 'Studio._vibyra-host._tcp.local.', name: 'Ellis’s Studio',
  hostId: key('ab'), host: '192.168.1.24', port: 4318, via: 'wifi' };
const laptop: NearbyComputer = { id: 'Workshop._vibyra-host._tcp.local.', name: 'Workshop MacBook Pro',
  hostId: key('cd'), host: '192.168.1.31', port: 4318, via: 'vpn' };
const arriving: NearbyComputer = { id: 'Mini._vibyra-host._tcp.local.', name: 'Living room mini',
  via: 'direct' };
// Resolved, but advertising no identity: an older Host that still needs a code.
const older: NearbyComputer = { id: 'Attic._vibyra-host._tcp.local.', name: 'Attic tower',
  host: '192.168.1.44', port: 4318, via: 'wifi' };

const scripts: Record<string, DiscoveryUpdate[]> = {
  searching: [{ status: 'searching', computers: [], networks: links }],
  one: [{ status: 'searching', computers: [], networks: links },
    { status: 'searching', computers: [studio], networks: links }],
  many: [{ status: 'searching', computers: [studio], networks: links },
    { status: 'searching', computers: [studio, laptop, arriving, older], networks: links }],
  denied: [{ status: 'searching', computers: [], networks: links },
    { status: 'denied', computers: [], networks: links }],
  empty: [{ status: 'searching', computers: [], networks: links },
    { status: 'finished', computers: [], networks: links }],
  failed: [{ status: 'searching', computers: [], networks: links },
    { status: 'failed', computers: [], networks: links }],
  cellular: [{ status: 'searching', computers: [], networks: offline }],
};

function scripted() {
  const state = new URLSearchParams(window.location.search).get('state') ?? 'searching';
  return scripts[state] ?? scripts.searching;
}

export const localDiscovery: DiscoveryAdapter = {
  get available() {
    return new URLSearchParams(window.location.search).get('state') !== 'unavailable';
  },
  start(onUpdate) {
    let active = true;
    const timers = scripted().map((update, index) => setTimeout(() => {
      if (active) onUpdate(update);
    }, index * 140));
    return () => { active = false; timers.forEach(clearTimeout); };
  },
};
