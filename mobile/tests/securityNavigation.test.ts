import assert from 'node:assert/strict';
import test from 'node:test';
import { openSecurityNotification, subscribeSecurityNavigation } from '../src/notifications/securityNavigation';
import type { RemoteDashboardApi } from '../src/remote/dashboardApi';
const id = '11111111-1111-4111-8111-111111111111';
function harness() {
  let owner: string | null = 'account';
  let read = 0, actions = 0;
  const api: RemoteDashboardApi = { identity: () => owner,
    events: async () => [{ id, eventType: 'REMOTE_SESSION_STARTED', title: 'Remote access started', createdAt: new Date().toISOString(), read: false }],
    readEvent: async () => { read++; }, devices: async () => [], sessions: async () => [],
    passkeys: async () => [], removePasskey: async () => { actions++; },
    revoke: async () => { actions++; }, revokeAll: async () => { actions++; },
    disable: async () => { actions++; }, disconnect: async () => { actions++; }, disconnectAll: async () => { actions++; } };
  return { api, account(value: string | null) { owner = value; }, counts: () => ({ read, actions }) };
}
test('security push opens settings only after owned event read and never dispatches remote actions', async () => {
  const h = harness(); let opened = 0;
  const stop = subscribeSecurityNavigation(() => { opened++; });
  try {
    await openSecurityNotification(h.api, id);
    assert.equal(opened, 1); assert.deepEqual(h.counts(), { read: 1, actions: 0 });
    await assert.rejects(openSecurityNotification(h.api, '../../remote/connect'), /Invalid/);
    await assert.rejects(openSecurityNotification(h.api, '22222222-2222-4222-8222-222222222222'), /not available/);
    assert.equal(opened, 1);
  } finally { stop(); }
});
test('account switch or signout during security event read prevents notification navigation', async () => {
  const h = harness(); let opened = 0;
  const stop = subscribeSecurityNavigation(() => { opened++; });
  const events = h.api.events;
  try {
    h.api.events = async () => { const value = await events(); h.account('other'); return value; };
    await assert.rejects(openSecurityNotification(h.api, id), /not available/);
    h.account(null);
    await assert.rejects(openSecurityNotification(h.api, id), /Sign in/);
    assert.equal(opened, 0); assert.deepEqual(h.counts(), { read: 0, actions: 0 });
  } finally { stop(); }
});
