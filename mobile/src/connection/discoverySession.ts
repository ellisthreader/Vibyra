import type { DiscoveryAdapter, DiscoveryUpdate } from './discoveryTypes';

// Constructing or showing the sheet never starts network activity. Only start,
// called by the explicit Search button, crosses that boundary.
export function createDiscoverySession(adapter: DiscoveryAdapter, update: (value: DiscoveryUpdate) => void) {
  let generation = 0;
  let dispose: (() => void) | undefined;
  const stop = () => { generation++; dispose?.(); dispose = undefined; };
  return {
    stop,
    start() {
      stop();
      const current = generation;
      update({ status: adapter.available ? 'searching' : 'unavailable', computers: [] });
      if (!adapter.available) return;
      dispose = adapter.start(value => { if (current === generation) update(value); });
    },
  };
}
