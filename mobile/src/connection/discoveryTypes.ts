/** The kind of link a search covers. `direct` is Apple peer-to-peer, which
 *  reaches a computer with no shared network at all; `cellular` is reported so
 *  the UI can say it is not searched, because multicast does not run there. */
export type NetworkKind = 'wifi' | 'direct' | 'wired' | 'shared' | 'vpn' | 'other' | 'cellular';
export interface SearchNetwork { id: string; kind: NetworkKind; label: string; searched: boolean }

/** A computer seen on one of those links. `hostId`/`host`/`port` arrive from the
 *  Bonjour record and Apple's service resolution, and only a computer that has
 *  all three can be connected without a pairing code. `via` is the link it
 *  answered on. Names and records are untrusted: the Noise handshake and the
 *  approval on the computer still authenticate. */
export interface NearbyComputer {
  id: string; name: string; hostId?: string; host?: string; port?: number; via?: NetworkKind;
}
export type DiscoveryStatus = 'idle' | 'searching' | 'finished' | 'denied' | 'failed' | 'unavailable';
export interface DiscoveryUpdate {
  status: DiscoveryStatus; computers: NearbyComputer[]; networks?: SearchNetwork[];
}
export interface DiscoveryAdapter {
  available: boolean;
  start: (onUpdate: (update: DiscoveryUpdate) => void) => () => void;
}
