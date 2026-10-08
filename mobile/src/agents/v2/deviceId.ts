import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { readFlag, writeFlag } from '../../transport/deviceFlags';
import { DEVICE_ID, newDeviceId } from './overviewModel';

const KEY = 'agent-v2-device';
let cached: string | null = null;

/**
 * The stable id this install sends as `X-Vibyra-Device`, so "read" is per device (contract §6d).
 * Generated once and kept in the same non-secret device store as other install flags; if storage
 * cannot be read, a per-launch id still works and the server just treats the next launch as a new device.
 */
export async function installDevice(): Promise<string> {
  if (cached) return cached;
  const saved = await readFlag(KEY).catch(() => null);
  if (saved && DEVICE_ID.test(saved)) return (cached = saved);
  const fresh = newDeviceId(Platform.OS === 'web' ? 'web' : 'ios', randomUUID());
  cached = fresh;
  await writeFlag(KEY, fresh).catch(() => {});
  return fresh;
}
