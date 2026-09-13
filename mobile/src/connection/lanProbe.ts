import Constants from 'expo-constants';
import type { DiscoveryUpdate } from './discoveryTypes';
import { probeIdentity } from './probeIdentity';
import { deviceAddress } from './probeSources';
import { probePlan } from './probeTargets';

import { startProbeSearch } from './probeSearch';

/** Expo Go fallback. Native builds use Bonjour's live service list. */
export function startProbe(onUpdate: (update: DiscoveryUpdate) => void) {
  return startProbeSearch(resolvePlan, probeIdentity, onUpdate);
}

async function resolvePlan() {
  const expo = Constants.expoConfig as { hostUri?: string } | null | undefined;
  const page = typeof globalThis.location === 'object' ? globalThis.location?.href : undefined;
  // The address serving this bundle comes first: it is reachable by
  // construction, since the app itself arrived over it. The device's own
  // address supplements it, and can name the wrong interface on a Mac with
  // several, so it does not lead.
  return probePlan([expo?.hostUri, Constants.expoGoConfig?.debuggerHost,
    await deviceAddress(), page]);
}

