import { apiUrl, requestJson } from '../transport/requestJson';

export interface NotificationPreferences {
  revision: number;
  attention: boolean;
  replies: boolean;
  smart: boolean;
  advisories: boolean;
  timezone: string;
  quietStart: number | null;
  quietEnd: number | null;
}
export interface NotificationDestination {
  source: 'cloud_turn' | 'host_conversation';
  runId: string;
  chatId?: string;
  agentId?: string | null;
  turnId?: string;
  hostId?: string;
  sessionId?: string;
}
export interface NotificationItem {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  read: boolean;
  actionable: boolean;
  destination: NotificationDestination;
}
export interface NotificationSettings {
  deviceId?: string | null;
  preferences: NotificationPreferences;
  capabilities: { inbox: boolean; push: boolean; smart: boolean };
}
export interface NotificationRegistration {
  installation: string;
  proof: string;
  token: string;
  projectId: string;
  environment: string;
}
export interface NotificationsApi {
  identity(): string | null;
  settings(): Promise<NotificationSettings>;
  save(preferences: NotificationPreferences): Promise<NotificationSettings>;
  register(data: NotificationRegistration): Promise<{ id: string }>;
  revoke(id: string): Promise<void>;
  presence(deviceId: string, runId: string | null): Promise<void>;
  inbox(): Promise<NotificationItem[]>;
  item(id: string): Promise<NotificationItem>;
  read(id: string): Promise<void>;
}
export function createNotificationsApi(
  base: string,
  token: () => string | null,
  fetcher = fetch,
): NotificationsApi {
  async function call(path: string, method = 'GET', body?: unknown) {
    const owner = token();
    if (!owner) throw new Error('Sign in to use notifications.');
    const { response, data } = await requestJson(
      fetcher,
      apiUrl(base, `notifications/v1/${path}`),
      {
        method,
        headers: {
          Authorization: `Bearer ${owner}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      15000,
    );
    if (owner !== token()) throw new Error('The signed-in account changed.');
    if (!response.ok)
      throw new Error(data.message || data.error || 'Notifications are not available yet.');
    return data;
  }
  return {
    identity: token,
    settings: () => call('preferences'),
    save: (value) => call('preferences', 'PATCH', value),
    register: (value) => call('devices', 'POST', value),
    revoke: async (id) => {
      await call(`devices/${encodeURIComponent(id)}`, 'DELETE');
    },
    presence: async (deviceId, runId) => {
      await call('presence', 'POST', { deviceId, runId });
    },
    inbox: async () => (await call('inbox')).items,
    item: async (id) => (await call(`inbox/${encodeURIComponent(id)}`)).item,
    read: async (id) => {
      await call(`inbox/${encodeURIComponent(id)}/read`, 'POST', {});
    },
  };
}
