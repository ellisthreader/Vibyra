import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentsApi } from '../src/agents/api';
import { teammateChatApi } from '../src/agents/chatAdapter';
import { VibesStore } from '../src/vibes/VibesStore';
import { VibesError } from '../src/vibes/api';
import type { AgentsApi, Teammate } from '../src/agents/types';
import type { VibesApi } from '../src/vibes/types';

test('teammate API uses account auth, native contract and rejects stale-account responses', async () => {
  let token: string | null = 'account-a'; const calls: { url: string; body: any; auth: string | null }[] = [];
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get('Authorization') });
    return new Response(JSON.stringify({ version: 1, enabled: true, teammates: [] }));
  }) as typeof fetch;
  const api = createAgentsApi('https://example.test/', () => token, fetcher);
  await api.list(); await api.decide('tool-id', 'a'.repeat(64), 'decline');
  assert.equal(calls[0]!.url, 'https://example.test/api/agents/v1/teammates');
  assert.equal(calls[0]!.auth, 'Bearer account-a');
  assert.deepEqual(calls[1]!.body, { fingerprint: 'a'.repeat(64), decision: 'decline' });
  token = null; await assert.rejects(api.list(), (e: VibesError) => e.status === 401); assert.equal(calls.length, 2);
  token = 'account-a'; const stale = createAgentsApi('', () => token, (async () => { token = 'account-b'; return new Response('{}'); }) as typeof fetch);
  await assert.rejects(stale.list(), (e: VibesError) => e.status === 401);
});

test('ambiguous create retry preserves the UUID and full payload; edit carries revision', async () => {
  const calls: any[] = []; let failed = false;
  const api = createAgentsApi('', () => 'account', (async (_url, init) => {
    calls.push(JSON.parse(String(init?.body))); if (!failed) { failed = true; throw new Error('timeout'); }
    return new Response('{"teammate":{"id":"same-id"}}');
  }) as typeof fetch);
  const fields = { name: 'Helper', brief: 'Review changes', avatar: 'site' as const, memory: '', budget: 5, integrations: ['github'], model: 'anthropic/claude-test', skillIds: ['skill-a'] };
  await assert.rejects(api.save(fields, { id: 'same-id' }), (e: VibesError) => e.status === 0);
  await api.save(fields, { id: 'same-id' }); assert.deepEqual(calls[0], calls[1]); assert.equal(calls[1].model, fields.model); assert.deepEqual(calls[1].skillIds, fields.skillIds);
  await api.save(fields, { id: 'same-id', revision: 2 }); assert.equal(calls[2].revision, 2); assert.equal(calls[2].id, undefined);
});

test('teammate chat scope keeps Work selection, pending send and history separate', async () => {
  const a = { id: 'agent', chatId: 'agent-chat' } as Teammate;
  const agents = { chats: async () => [{ id: 'agent-chat', title: 'Helper', trial_slot: null, trial_used: 0 }] } as unknown as AgentsApi;
  const base = { chats: async () => [{ id: 'work-chat' }], quote: async (id: string) => ({ quote: id }), turns: async () => [] } as unknown as VibesApi;
  const scoped = teammateChatApi(base, agents, a); const persistence = { read: async () => null, write: async () => {} };
  const work = new VibesStore(base, () => 'work-id', persistence); const agent = new VibesStore(scoped, () => 'agent-id', persistence);
  work.update({ selected: 'work-chat', pending: 'pending-work', draftScope: 'work-chat' });
  await agent.select(a.chatId);
  assert.equal(work.state.selected, 'work-chat'); assert.equal(work.state.pending, 'pending-work');
  assert.equal((await scoped.chats())[0]!.id, 'agent-chat'); assert.equal((await base.chats())[0]!.id, 'work-chat');
  await assert.rejects(scoped.quote('work-chat', 'hello', 'auto'), /another teammate/);
  await assert.rejects(scoped.createChat('new', 'Hello'), /Reopen this teammate/);
  assert.equal(scoped.attach, undefined); assert.equal(scoped.toolResult, undefined);
});

test('engine catalogue reads the existing Vibes models endpoint', async () => {
  let url = '';
  const api = createAgentsApi('https://example.test', () => 'account', (async value => {
    url = String(value); return new Response('{"models":[{"id":"test/model","name":"Test","available":true}]}');
  }) as typeof fetch);
  assert.equal((await api.models!())[0]?.id, 'test/model');
  assert.equal(url, 'https://example.test/api/vibes/models');
});

test('missing skill and teammate lists are rejected before UI consumers receive them', async () => {
  const api = createAgentsApi('https://example.test', () => 'account',
    (async () => new Response('{}')) as typeof fetch);
  await assert.rejects(api.skills!(), /unexpected response/);
  await assert.rejects(api.chats!('teammate-one'), /unexpected response/);
});
