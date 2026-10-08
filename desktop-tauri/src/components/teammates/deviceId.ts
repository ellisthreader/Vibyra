import { DEVICE_ID, newDeviceId } from '../../../../mobile/src/agents/v2/overviewModel.ts';

const KEY = 'vibyra.agent-v2-device';
let cached: string | null = null;

/**
 * The id this install sends as `X-Vibyra-Device` (contract §6d), so "read" is per install and
 * survives signing out and in. Generated once and kept in localStorage; if storage is blocked a
 * per-launch id still works (the server then treats the next launch as a new device).
 */
export function macDevice(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
  random: () => string = () => crypto.randomUUID()): string {
  if (cached) return cached;
  try { const saved = storage?.getItem(KEY); if (saved && DEVICE_ID.test(saved)) return (cached = saved); } catch { /* keep going */ }
  const fresh = newDeviceId('mac', random());
  cached = fresh;
  try { storage?.setItem(KEY, fresh); } catch { /* per-launch id */ }
  return fresh;
}
/** For tests: forget the in-memory copy. */
export const resetMacDevice = () => { cached = null; };
