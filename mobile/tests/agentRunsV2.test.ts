import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VibesError } from '../src/vibes/api';
import type { VibesApi } from '../src/vibes/types';
import type { Teammate } from '../src/agents/types';
import { applyEvents, emptyFeed, modeFromProbe, pollDelay, runNotice, runToTurn, turnStatus, type Run } from '../src/agents/v2/runCore';
import { createRunsApi, RunError, type RunsApi } from '../src/agents/v2/runsApi';
import { runChatApi } from '../src/agents/v2/runChat';

const agent = { id: 'agent-1', chatId: 'chat-1' } as Teammate;
const run = (patch: Partial<Run> = {}): Run => ({ id: 'run-1', agentId: 'agent-1', conversationId: 'chat-1', conversationSeq: 1,
  idempotencyKey: 'send-key-1', state: 'running', stateReason: null, terminal: false, prompt: 'Summarise my inbox', answer: null,
  runtime: { provider: 'codex', model: 'gpt-test' }, eventCursor: 0, actions: [], createdAt: '2026-09-30T12:00:00+00:00', ...patch });
const base = { turns: async () => [], turn: async () => { throw new VibesError('Not found', 404); }, cancel: async () => {} } as unknown as VibesApi;
const memory = () => { let value: string | null = null; return { read: async () => value, write: async (v: string) => { value = v; }, get: () => value }; };
const runsStub = (patch: Partial<RunsApi>): RunsApi => ({ probe: async () => ({ mode: 'v2', final: true }), admit: async () => run(),
  list: async () => [], run: async () => run(), events: async () => ({ events: [], nextCursor: 0, state: 'running', terminal: false, latestSeq: 0 }),
  cancel: async () => run({ state: 'cancelled', terminal: true }), decide: async () => {}, ...patch });

test('an uncertain send keeps its key and exact body, and the retry replays them unchanged', async () => {
  const bodies: unknown[] = []; let fail = true;
  const saved = memory();
  const api = runChatApi(base, runsStub({
    admit: async body => { bodies.push(body); if (fail) { fail = false; throw new RunError('Connection interrupted.', 0, null); } return run(); },
  }), agent, saved);
  const quote = await api.quote('chat-1', 'Summarise my inbox', 'auto');
  await assert.rejects(api.submit('send-key-1', quote.quote), (e: VibesError) => e.status === 0);
  assert.match(saved.get()!, /send-key-1/, 'key and body are on the device before and after the failed write');
  const turn = await api.turn('send-key-1');
  assert.equal(turn.id, 'run-1');
  assert.deepEqual(bodies[0], { agentId: 'agent-1', prompt: 'Summarise my inbox', attachments: [], idempotencyKey: 'send-key-1' });
  assert.deepEqual(bodies[1], bodies[0]);
  await assert.rejects(api.quote('other-chat', 'x', 'auto'));
  await assert.rejects(api.quote('chat-1', 'x', 'auto', null, [], ['file-1']), /Attachments/, 'without an upload client the attachment is refused, not dropped');
});

test('a refusal releases the send only after the conversation confirms no run holds the key', async () => {
  const saved = memory();
  const refused = runChatApi(base, runsStub({ admit: async () => { throw new RunError('Open Vibyra on your Mac.', 409, 'runtime_required'); } }), agent, saved);
  const quote = await refused.quote('chat-1', 'Hello', 'auto');
  await assert.rejects(refused.submit('send-key-2', quote.quote), (e: VibesError) => e.status === 404 && /Open Vibyra/.test(e.message));
  assert.equal(saved.get(), '[]');
  const unsure = memory();
  const lookupFails = runChatApi(base, runsStub({ admit: async () => { throw new RunError('Slow down.', 429, null); },
    list: async () => { throw new RunError('Connection interrupted.', 0, null); } }), agent, unsure);
  await assert.rejects(lookupFails.submit('send-key-3', quote.quote), (e: VibesError) => e.status === 0);
  assert.match(unsure.get()!, /send-key-3/);
  const found = runChatApi(base, runsStub({ admit: async () => { throw new RunError('Plan changed.', 402, 'plan_required'); },
    list: async () => [run({ idempotencyKey: 'send-key-4', prompt: 'Hello' })] }), agent, memory());
  assert.equal((await found.submit('send-key-4', quote.quote)).id, 'run-1');
});

test('events replay gap-free from the saved cursor and render deltas, then the final answer', async () => {
  const afters: number[] = [];
  const pages = [[{ seq: 1, type: 'message.delta', payload: { text: 'Three ' } }, { seq: 2, type: 'message.delta', payload: { text: 'unread' } }],
    [{ seq: 3, type: 'status', payload: { text: 'Reading Gmail' } }]];
  const api = runChatApi(base, runsStub({ list: async () => [run()],
    events: async (_id, after) => { afters.push(after); const events = pages.shift() ?? []; return { events, nextCursor: after + events.length, state: 'running', terminal: false, latestSeq: after + events.length }; } }), agent, memory());
  const first = await api.turns('chat-1');
  assert.equal(first[0]!.response, 'Three unread');
  const second = await api.turns('chat-1');
  assert.equal(second[0]!.error, 'Reading Gmail');
  await api.turns('chat-1'); assert.deepEqual(afters, [0, 2, 3], 'each poll resumes at the last applied seq');
  assert.equal(api.nextDelay(), 1000);
  const gap = applyEvents(emptyFeed(), [{ seq: 2, type: 'message.delta', payload: { text: 'late' } }]);
  assert.deepEqual([gap.cursor, gap.text], [0, '']);
  assert.equal(runToTurn(run({ state: 'completed', terminal: true, answer: 'Done.' }), { ...emptyFeed(), text: 'partial' }).response, 'Done.');
});

test('run states map onto the existing transcript and approval vocabulary', () => {
  assert.deepEqual(['waiting_for_computer', 'starting', 'waiting_for_tool', 'waiting_for_approval', 'waiting_for_signin', 'outcome_unknown', 'cancelled']
    .map(turnStatus), ['queued', 'queued', 'running', 'waiting', 'waiting', 'failed', 'cancelled']);
  assert.match(runNotice(run({ state: 'waiting_for_computer' }))!, /Waiting for your Mac/);
  assert.match(runNotice(run({ state: 'waiting_for_signin' }), { ...emptyFeed(), signin: { scope: 'connection', provider: 'gmail' } })!, /Reconnect Gmail/);
  assert.match(runNotice(run({ state: 'failed', stateReason: 'provider_error' }))!, /provider_error/);
  assert.match(runNotice(run({ state: 'outcome_unknown' }))!, /unconfirmed/);
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  const turn = runToTurn(run({ state: 'waiting_for_approval', actions: [
    { id: 'act-1', callId: 'c1', tool: 'gmail_send', kind: 'write', connectionId: 'conn', state: 'pending_approval', summary: null,
      arguments: { to: 'a@example.com', subject: 'Hi' }, fingerprint: 'f'.repeat(64), expiresAt, receipt: null },
    { id: 'act-2', callId: 'c2', tool: 'google_calendar_list', kind: 'read', connectionId: 'conn', provider: 'google_calendar', account: 'me@example.com', state: 'completed', summary: 'Listed',
      receipt: { status: 'confirmed', summary: 'Listed 3 events' } }] }));
  assert.equal(turn.tools[0]!.approval!.state, 'pending');
  assert.deepEqual(turn.tools[0]!.approval!.arguments, { to: 'a@example.com', subject: 'Hi' });
  assert.equal(turn.tools[0]!.expiresAt, Date.parse(expiresAt) / 1000);
  assert.deepEqual([turn.tools[1]!.integration, turn.tools[1]!.summary, turn.tools[1]!.approval], ['google_calendar', 'Listed 3 events', null]);
  assert.equal(turn.tools[1]!.account, 'me@example.com');
  assert.equal(turn.tools[0]!.integration, '', 'a missing provider is never guessed from the tool name');
  assert.equal(pollDelay(['waiting_for_computer']), 10000); assert.equal(pollDelay(['waiting_for_approval']), 3000); assert.equal(pollDelay([]), 5000);
});

test('HTTP client: decision carries the fingerprint, GETs revalidate with ETag, probe selects v1 or v2', async () => {
  const calls: { url: string; method: string; body: any; match: string | null }[] = [];
  let probe = 200;
  const fetcher = (async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null, match: headers.get('If-None-Match') });
    if (String(url).endsWith('/runtimes')) return new Response(JSON.stringify(probe === 200 ? { runtimes: [] } : { ok: false, code: 'not_in_cohort' }), { status: probe });
    if (headers.get('If-None-Match') === '"v1"') return new Response(null, { status: 304 });
    if (String(url).includes('/decision')) return new Response(JSON.stringify({ action: {} }));
    return new Response(JSON.stringify({ run: run() }), { headers: { ETag: '"v1"' } });
  }) as typeof fetch;
  const api = createRunsApi('https://example.test', () => 'token', fetcher);
  await api.decide('act-1', 'f'.repeat(64), 'allow');
  assert.equal(calls[0]!.url, 'https://example.test/api/agents/v2/actions/act-1/decision');
  assert.deepEqual(calls[0]!.body, { fingerprint: 'f'.repeat(64), decision: 'allow' });
  assert.equal((await api.run('run-1')).id, 'run-1');
  assert.equal((await api.run('run-1')).id, 'run-1', '304 reuses the cached run');
  assert.deepEqual([calls[1]!.match, calls[2]!.match], [null, '"v1"']);
  assert.deepEqual(await api.probe(), { mode: 'v2', final: true });
  for (const [status, final] of [[403, true], [503, true], [404, true], [500, false]] as const) {
    probe = status; assert.deepEqual(await api.probe(), { mode: 'v1', final });
  }
  const offline = createRunsApi('', () => 'token', (async () => { throw new Error('offline'); }) as typeof fetch);
  assert.deepEqual(await offline.probe(), modeFromProbe(null));
  assert.deepEqual(modeFromProbe(null), { mode: 'v1', final: false });
});
