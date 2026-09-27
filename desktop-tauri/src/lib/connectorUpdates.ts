export interface ConnectorUpdate { identity: string; catalogue?: unknown; error?: string }
const listeners = new Set<(update: ConnectorUpdate) => void>();
const versions = new Map<string, number>();
export const connectorVersion = (identity: string) => versions.get(identity) ?? 0;
export function publishConnectorUpdate(update: ConnectorUpdate) {
  versions.set(update.identity, connectorVersion(update.identity) + 1);
  listeners.forEach(listener => listener(update));
}
export function subscribeConnectorUpdates(listener: (update: ConnectorUpdate) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
