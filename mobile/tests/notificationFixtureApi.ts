import type { NotificationsApi, NotificationSettings } from '../src/notifications/api';
let settings: NotificationSettings = { deviceId: null, capabilities: { push: false, inbox: true, smart: true }, preferences: {
  revision: 1, attention: true, replies: true, smart: false, advisories: false, timezone: 'Europe/London', quietStart: null, quietEnd: null,
} };
export const notificationFixtureApi: NotificationsApi = {
  identity: () => 'fixture', settings: async () => settings,
  save: async preferences => { settings = { ...settings, preferences: { ...preferences, revision: preferences.revision + 1 } }; return settings; },
  register: async () => ({ id: 'fixture' }), revoke: async () => {}, presence: async () => {},
  inbox: async () => [{ id: '00000000-0000-4000-8000-000000000001', title: 'Your task may need a review',
    category: 'advisories', createdAt: '2026-09-22T12:00:00Z', read: false, actionable: true,
    destination: { source: 'cloud_turn', runId: 'fixture', chatId: 'fixture' } }],
  item: async () => { throw new Error('This sample update cannot open a real task.'); }, read: async () => {},
};
