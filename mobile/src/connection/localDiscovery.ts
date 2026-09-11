import { requireOptionalNativeModule } from 'expo';
import type { DiscoveryAdapter, DiscoveryUpdate } from './discoveryTypes';
import { startProbe } from './lanProbe';

interface NativeDiscovery {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onDiscovery', listener: (update: DiscoveryUpdate) => void): { remove(): void };
}
const native = requireOptionalNativeModule<NativeDiscovery>('VibyraDiscovery');
/** Bonjour is the real search and covers every link at once. Without the native
 *  module — Expo Go, or any build that has not included it — the address sweep
 *  takes over so the search is still real rather than a dead end. */
export const localDiscovery: DiscoveryAdapter = {
  available: true,
  start(onUpdate) {
    if (!native) return startProbe(onUpdate);
    let active = true;
    const subscription = native.addListener('onDiscovery', update => { if (active) onUpdate(update); });
    void native.start().catch(() => { if (active) onUpdate({ status: 'failed', computers: [] }); });
    return () => { active = false; subscription.remove(); void native.stop().catch(() => {}); };
  },
};
