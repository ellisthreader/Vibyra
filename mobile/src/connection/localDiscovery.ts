import { requireOptionalNativeModule } from 'expo';
import type { DiscoveryAdapter } from './discoveryTypes';
import { startProbe } from './lanProbe';
import { startNativeDiscovery, type NativeDiscoverySource } from './nativeDiscoveryRecovery';

const native = requireOptionalNativeModule<NativeDiscoverySource>('VibyraDiscovery');
/** Bonjour searches all local links first. If it yields no usable endpoint,
 *  the native adapter runs one bounded LAN probe; without the native module
 *  (Expo Go), that probe is the primary search. */
export const localDiscovery: DiscoveryAdapter = {
  available: true,
  start(onUpdate) {
    if (!native) return startProbe(onUpdate);
    return startNativeDiscovery(native, startProbe, onUpdate);
  },
};
