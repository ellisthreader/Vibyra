import { requireOptionalNativeModule } from 'expo';
import type { DiscoveryAdapter, DiscoveryUpdate } from './discoveryTypes';

interface NativeDiscovery {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onDiscovery', listener: (update: DiscoveryUpdate) => void): { remove(): void };
}
const native = requireOptionalNativeModule<NativeDiscovery>('VibyraDiscovery');
export const localDiscovery: DiscoveryAdapter = {
  available: !!native,
  start(onUpdate) {
    if (!native) { onUpdate({ status: 'unavailable', computers: [] }); return () => {}; }
    let active = true;
    const subscription = native.addListener('onDiscovery', update => { if (active) onUpdate(update); });
    void native.start().catch(() => { if (active) onUpdate({ status: 'failed', computers: [] }); });
    return () => { active = false; subscription.remove(); void native.stop().catch(() => {}); };
  },
};
