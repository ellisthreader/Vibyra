import type { NotificationsApi } from './api';
export async function enablePhoneNotifications(_api: NotificationsApi): Promise<string> {
  throw new Error('Enable notifications in the native iPhone app.');
}
export async function notificationModule(): Promise<never> {
  throw new Error('Phone notifications require the native iPhone app.');
}
