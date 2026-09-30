import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { readSecure, writeSecure } from '../transport/secureStorage';
import type { NotificationsApi } from './api';
const key = 'notification-installation-v1';
export async function notificationModule() {
  if (Platform.OS !== 'ios') throw new Error('Phone notifications require a native iPhone build.');
  try {
    return await import('expo-notifications');
  } catch {
    throw new Error('Update the native Vibyra app to enable notifications.');
  }
}
export async function enablePhoneNotifications(api: NotificationsApi) {
  const owner = api.identity();
  const module = await notificationModule();
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || !projectId)
    throw new Error('This build is not configured for phone notifications yet.');
  let permission = await module.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain)
    permission = await module.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error('Notifications are off. You can enable them in iPhone Settings.');
  let saved: { installation: string; proof: string } | null = null;
  try {
    saved = JSON.parse((await readSecure(key)) ?? 'null');
  } catch {
    /* replace invalid local registration */
  }
  if (!saved?.installation || !saved.proof) {
    saved = { installation: randomUUID(), proof: randomUUID() + randomUUID() };
    await writeSecure(key, JSON.stringify(saved));
  }
  const token = (await module.getExpoPushTokenAsync({ projectId })).data;
  if (!owner || owner !== api.identity()) throw new Error('The signed-in account changed.');
  const result = await api.register({
    ...saved,
    token,
    projectId,
    environment: Constants.expoConfig?.extra?.pushEnvironment ?? 'development',
  });
  return result.id;
}
