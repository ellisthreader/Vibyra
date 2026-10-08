import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createNotificationsApi } from '../src/notifications/api';
import type { NotificationDestination } from '../src/notifications/api';
import { agentTarget, openNotification, subscribeNotificationNavigation } from '../src/notifications/navigation';

const id = '00000000-0000-4000-8000-0000000000aa';
const destination: NotificationDestination = {
  source: 'agent_run', runId: 'run-1', agentId: 'agent-1', conversationId: 'chat-1', kind: 'approval',
};

function fixture(item: unknown, token: () => string | null = () => 'token') {
  const calls: { url: string; method: string; body?: string }[] = [];
  const api = createNotificationsApi('https://fixture', token, async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (!token()) return new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401 });
    return new Response(JSON.stringify(String(url).endsWith('/read') ? { ok: true } : { item }), { status: 200 });
  });
  return { api, calls };
}

test('an Agent v2 push opens the exact teammate run in Agent mode', async () => {
  const { api, calls } = fixture({ destination, actionable: true, status: { runState: 'waiting_for_approval', actionId: 'a', actionState: 'pending_approval' } });
  let opened: NotificationDestination | undefined;
  const stop = subscribeNotificationNavigation((d) => { opened = d; });
  await openNotification(api, id);
  stop();
  assert.deepEqual(agentTarget(opened!), { id: 'agent-1', runId: 'run-1' });
  assert.ok(calls[0].url.endsWith(`/notifications/v1/inbox/${id}`));
  assert.equal(calls[0].method, 'GET');
  // Only the read mark is written; nothing reaches an approval or decision route.
  assert.ok(calls.every((c) => !/decision|actions|agents\//.test(c.url)));
});

test('an expired approval still navigates to current state and never approves', async () => {
  const { api, calls } = fixture({ destination, actionable: false, status: { runState: 'running', actionId: 'a', actionState: 'expired' } });
  let opened = false;
  const stop = subscribeNotificationNavigation(() => { opened = true; });
  await openNotification(api, id);
  stop();
  assert.equal(opened, true);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST']);
  assert.ok(calls[1].url.endsWith('/read'));
});

test('a stale push after logout opens nothing', async () => {
  const { api } = fixture({ destination }, () => null);
  let opened = false;
  const stop = subscribeNotificationNavigation(() => { opened = true; });
  await assert.rejects(openNotification(api, id), /Sign in/);
  stop();
  assert.equal(opened, false);
});

test('an Agent v2 destination without a teammate is refused', async () => {
  const { api } = fixture({ destination: { ...destination, agentId: null } });
  await assert.rejects(openNotification(api, id), /teammate is unavailable/);
  assert.equal(agentTarget({ source: 'host_conversation', runId: 'r', hostId: 'h', sessionId: 's' }), null);
});
