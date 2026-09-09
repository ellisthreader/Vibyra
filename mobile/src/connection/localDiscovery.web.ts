import type { DiscoveryAdapter } from './discoveryTypes';
export const localDiscovery: DiscoveryAdapter = {
  available: false,
  start(onUpdate) { onUpdate({ status: 'unavailable', computers: [] }); return () => {}; },
};
