import type { DiscoveryAdapter } from './discoveryTypes';
import { startProbe } from './lanProbe';

// The browser has no Bonjour, so the address sweep is the whole search here.
export const localDiscovery: DiscoveryAdapter = { available: true, start: startProbe };
