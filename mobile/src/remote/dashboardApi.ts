import type { RemoteDevice, RemotePermission } from './securityTypes';
export interface RemoteSession { id: string; hostId: string; clientName: string; status: string; permissions: RemotePermission[]; connectedAt: string | null; expiresAt: string | null }
export interface SecurityEvent { id: string; eventType: string; title: string; createdAt: string; read: boolean }
export interface RemotePasskey { id: number; device_name: string; created_at: string; last_used_at: string | null }
export interface RemoteDashboardApi {
  identity(): string | null;
  devices(): Promise<RemoteDevice[]>;
  sessions(): Promise<RemoteSession[]>;
  events(): Promise<SecurityEvent[]>;
  passkeys(): Promise<RemotePasskey[]>;
  removePasskey(id: number): Promise<void>;
  readEvent(id: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  disconnectAll(ids: string[]): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeAll(): Promise<void>;
  disable(): Promise<void>;
}
type Call = (method: string, path: string, body?: object) => Promise<Record<string, unknown>>;
function rows<T>(value: unknown, valid: (row: T) => boolean): T[] {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || !valid(row)))
    throw new Error('Vibyra returned an invalid remote security list. Try again.');
  return value;
}
export function createDashboardApi(call: Call, identity: () => string | null): RemoteDashboardApi {
  const remove = async (path: string) => { await call('DELETE', path); };
  return {
    identity,
    devices: async () => rows<RemoteDevice>((await call('GET', '/api/security/devices')).devices,
      row => typeof row.id === 'string' && typeof row.deviceName === 'string'),
    sessions: async () => rows<RemoteSession>((await call('GET', '/api/remote/sessions')).sessions,
      row => typeof row.id === 'string' && typeof row.clientName === 'string' && typeof row.status === 'string'),
    events: async () => rows<SecurityEvent>((await call('GET', '/api/security/events')).events,
      row => typeof row.id === 'string' && typeof row.title === 'string' && typeof row.createdAt === 'string'),
    passkeys: async () => rows<RemotePasskey>((await call('GET', '/api/security/passkeys')).passkeys,
      row => Number.isSafeInteger(row.id) && row.id > 0 && typeof row.device_name === 'string'),
    removePasskey: id => {
      if (!Number.isSafeInteger(id) || id < 1) return Promise.reject(new Error('That passkey is not available.'));
      return remove(`/api/security/passkeys/${id}`);
    },
    readEvent: async id => { await call('POST', `/api/security/events/${encodeURIComponent(id)}/read`, {}); },
    disconnect: id => remove(`/api/remote/sessions/${encodeURIComponent(id)}`),
    disconnectAll: async ids => { await Promise.all(ids.map(id => remove(`/api/remote/sessions/${encodeURIComponent(id)}`))); },
    revoke: id => remove(`/api/security/devices/${encodeURIComponent(id)}`),
    revokeAll: () => remove('/api/security/devices'),
    disable: async () => { await call('POST', '/api/remote/disable', {}); },
  };
}
