import type { RemoteDashboardApi } from '../remote/dashboardApi';
const listeners = new Set<() => void>();
export function subscribeSecurityNavigation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** A push is a hint. Read the owned event before opening Settings; a push can
 * never approve a device, connect to a computer or dispatch control input. */
export async function openSecurityNotification(api: RemoteDashboardApi, id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new Error('Invalid security notification.');
  const owner = api.identity();
  if (!owner) throw new Error('Sign in to view this security event.');
  const events = await api.events();
  if (api.identity() !== owner || !events.some(event => event.id === id)) throw new Error('That security event is not available.');
  await api.readEvent(id);
  if (api.identity() !== owner) throw new Error('The signed-in account changed.');
  for (const listener of listeners) listener();
}
