import type { NotificationDestination, NotificationsApi } from './api';
type Listener = (destination: NotificationDestination) => void;
const listeners = new Set<Listener>();
export function subscribeNotificationNavigation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function openNotification(api: NotificationsApi, id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid notification.');
  const item = await api.item(id);
  const d = item.destination;
  if (!d || !['cloud_turn', 'host_conversation'].includes(d.source) || typeof d.runId !== 'string')
    throw new Error('This update cannot be opened.');
  if (d.source === 'cloud_turn' && typeof d.chatId !== 'string')
    throw new Error('This conversation is unavailable.');
  for (const listener of listeners) listener(d);
  await api.read(id);
}
