import type { NotificationDestination, NotificationsApi } from './api';
type Listener = (destination: NotificationDestination) => void;
const listeners = new Set<Listener>();
export function subscribeNotificationNavigation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Open a run from outside a notification (a Live Activity tap): the same route a tapped notification takes. */
export function routeToRun(destination: NotificationDestination) {
  for (const listener of listeners) listener(destination);
}

/** The teammate a destination opens in Agent mode, or null for Work mode targets. */
export function agentTarget(d: NotificationDestination): { id: string; runId?: string } | null {
  if (d.source === 'agent_run' && typeof d.agentId === 'string') return { id: d.agentId, runId: d.runId };
  if (d.source === 'cloud_turn' && typeof d.agentId === 'string' && d.agentId) return { id: d.agentId };
  return null;
}
export async function openNotification(api: NotificationsApi, id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid notification.');
  const item = await api.item(id);
  const d = item.destination;
  if (!d || !['cloud_turn', 'host_conversation', 'agent_run'].includes(d.source) || typeof d.runId !== 'string')
    throw new Error('This update cannot be opened.');
  if (d.source === 'cloud_turn' && typeof d.chatId !== 'string')
    throw new Error('This conversation is unavailable.');
  // Opening only navigates: the teammate thread shows the run's current state,
  // and any approval still needs the person's own tap there.
  if (d.source === 'agent_run' && typeof d.agentId !== 'string')
    throw new Error('This teammate is unavailable.');
  for (const listener of listeners) listener(d);
  await api.read(id);
}
