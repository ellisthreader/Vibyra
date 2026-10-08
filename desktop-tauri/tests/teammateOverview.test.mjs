import test from 'node:test';
import assert from 'node:assert/strict';
import { BridgeError, codeOf, fixOf, parseBridgeError, toBridgeError } from '../src/components/teammates/bridgeError.ts';
import { macDevice, resetMacDevice } from '../src/components/teammates/deviceId.ts';
import { overviewClient } from '../src/components/teammates/overviewClient.ts';
import { createFromTemplate } from '../src/components/teammates/templateCreate.ts';
import { isRunPending, runPending, runTurn, statusOf, submitRunPending } from '../src/components/teammates/runsV2.ts';
import { mergeRoster, STATUS_WORDS } from '../../mobile/src/agents/v2/overviewModel.ts';

const RS = '\u001e';
const FIX = 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.';
const refused = `409: Teammates run on an AI account you choose on your Mac, and none is selected yet.${RS}${JSON.stringify({ code: 'runtime_required', fix: { action: 'choose_ai_account', message: FIX } })}`;
const uuid = n => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k), m }; };

test('a bridge refusal keeps its clean words and carries code and fix beside them', () => {
  const parsed = parseBridgeError(refused);
  assert.equal(parsed.message, '409: Teammates run on an AI account you choose on your Mac, and none is selected yet.');
  assert.deepEqual([parsed.code, parsed.fix], ['runtime_required', { action: 'choose_ai_account', message: FIX }]);
  const error = toBridgeError(refused);
  assert.ok(error instanceof BridgeError);
  assert.equal(error.message, parsed.message); assert.equal(statusOf(error), 409);
  assert.equal(codeOf(error), 'runtime_required'); assert.equal(fixOf(error).action, 'choose_ai_account');
  // Nothing structured: exactly what the bridge threw, so every existing caller is unchanged.
  assert.equal(toBridgeError('404: Not found'), '404: Not found');
  const plain = new Error('Connection interrupted.'); assert.equal(toBridgeError(plain), plain);
  assert.deepEqual(parseBridgeError(`409: words${RS}not json`), { message: '409: words', code: null, fix: null });
  assert.deepEqual(parseBridgeError(`409: words${RS}${JSON.stringify({ code: 'Bad Code!', fix: { action: 'x' } })}`), { message: '409: words', code: null, fix: null });
  assert.equal(codeOf(new Error('x')), null); assert.equal(fixOf('409: x'), null);
});

test('the device id is generated once, kept, and always valid', () => {
  resetMacDevice(); const s = store();
  const first = macDevice(s, () => 'aaaa-bbbb');
  assert.equal(first, 'mac-aaaa-bbbb'); assert.match(first, /^[A-Za-z0-9._:-]{1,64}$/);
  resetMacDevice(); assert.equal(macDevice(s, () => 'different'), first, 'read back from storage, not regenerated');
  resetMacDevice(); const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.match(macDevice(blocked, () => 'once'), /^mac-once$/); assert.equal(macDevice(blocked, () => 'twice'), 'mac-once', 'a per-launch id at least stays stable');
  resetMacDevice(); assert.equal(macDevice({ getItem: () => 'bad id!', setItem() {} }, () => 'x y/z'), 'mac-xyz', 'a stored invalid id is replaced by a clean one');
  resetMacDevice();
});

test('the overview client asks for exactly the contract routes and parses the answers', async () => {
  const calls = [], device = [];
  const api = async (path, body) => {
    calls.push([path, body]);
    if (path === 'agents/v2/runs/preview') return { plan: { agentId: uuid(1), ready: true, maxTools: 10, runtime: { ok: true }, services: [], tools: [], approvals: [], dropped: [], mentioned: [], missing: [] } };
    if (path.startsWith('agents/v2/activity?')) return { items: [{ id: 'r1', actionId: 'a1', runId: 'run-1', agentId: uuid(1), agentName: 'Reviewer', tool: 'gmail_send', kind: 'write', provider: 'gmail', accountLabel: 'me@example.com', status: 'confirmed', outcome: 'confirmed', actionState: 'completed', summary: 'Sent', url: null, createdAt: '2026-09-30T10:00:00Z' }], nextCursor: 'abc_DEF-1' };
    if (path === 'agents/v2/templates') return { templates: [{ key: 'inbox_triage', name: 'Inbox triage', avatar: 'assistant', brief: 'b', suggested: { providers: [], schedule: null, trigger: null }, autoGrant: false }] };
    if (path.startsWith('agents/v2/templates/')) return { teammate: { id: uuid(9), name: 'Inbox triage' }, template: {} };
    throw new Error(`unexpected ${path}`);
  };
  const dev = async (path, body) => { device.push([path, body]); if (path === 'agents/v2/roster') return { teammates: [{ agentId: uuid(1), name: 'Reviewer', status: 'idle', readCursor: null, unread: false }] }; return { ok: true }; };
  const client = overviewClient(api, dev);
  const plan = await client.plan({ agentId: uuid(1), prompt: 'Hi there', attachments: ['att-1'] }, 'r4nd0m-value-123');
  assert.equal(plan.ready, true);
  assert.deepEqual(calls[0], ['agents/v2/runs/preview', { agentId: uuid(1), idempotencyKey: 'preview-r4nd0m-value-123', prompt: 'Hi there', attachments: [{ id: 'att-1' }] }]);
  const page = await client.activity({ provider: 'gmail', agentId: uuid(1), cursor: 'PAGE2', limit: 30 });
  assert.equal(calls[1][0], `agents/v2/activity?limit=30&provider=gmail&agentId=${uuid(1)}&cursor=PAGE2`);
  assert.equal(page.items[0].tool, 'gmail_send'); assert.equal(page.nextCursor, 'abc_DEF-1');
  assert.equal(calls[1][1], undefined, 'a GET carries no body');
  assert.equal((await client.roster())[0].agentId, uuid(1)); assert.deepEqual(device[0], ['agents/v2/roster', undefined]);
  assert.equal((await client.templates())[0].key, 'inbox_triage');
  assert.equal((await client.fromTemplate('inbox_triage', uuid(9))).id, uuid(9));
  assert.deepEqual(calls.at(-1), ['agents/v2/templates/inbox_triage/teammates', { id: uuid(9) }]);
  await assert.rejects(overviewClient(async () => ({ nothing: true }), dev).plan({ agentId: uuid(1), prompt: 'x', attachments: [] }, 'r'), /invalid task plan/);
});

test('read markers: ok, a stale cursor is refresh-and-retry, anything else is an error', async () => {
  const sent = [];
  const make = failure => overviewClient(async () => ({}), async (path, body) => { sent.push([path, body]); if (failure) throw toBridgeError(failure); return { ok: true }; });
  assert.equal(await make(null).markRead(uuid(1), 'd'.repeat(64)), 'ok');
  assert.deepEqual(sent[0], [`agents/v2/agents/${uuid(1)}/read`, { cursor: 'd'.repeat(64) }]);
  assert.equal(await make(`409: This conversation changed. Refresh before marking it read.${RS}{"code":"stale_cursor","fix":null}`).markRead(uuid(1), 'x'), 'stale');
  assert.equal(await make('409: This conversation changed. Refresh before marking it read.').markRead(uuid(1), 'x'), 'stale', 'the status alone is enough when a code did not arrive');
  await assert.rejects(make('Connection interrupted. Refresh to check the outcome.').markRead(uuid(1), 'x'), /interrupted/);
  await assert.rejects(make('404: That teammate does not exist.').markRead(uuid(1), 'x'), /404/);
  await assert.rejects(make(`409: Other conflict${RS}{"code":"agent_archived","fix":null}`).markRead(uuid(1), 'x'), /Other conflict/);
});

test('the v2 roster replaces status, unread and approvals on the matching teammates only', () => {
  const v1 = [{ id: uuid(1), status: 'idle', unread: false, lastMessage: 'old', lastRunId: null }, { id: uuid(2), status: 'running', unread: true, lastMessage: 'keep', lastRunId: 'v1' }];
  const rows = [{ agentId: uuid(1), status: 'waiting_for_approval', waitingApprovalCount: 2, readCursor: 'c'.repeat(64), unread: true, lastRun: { id: 'run-7', preview: 'Email the notes', state: 'waiting_for_approval' } }];
  const [a, b] = mergeRoster(v1, rows);
  assert.deepEqual([a.status, a.unread, a.readCursor, a.pendingDecisionCount, a.lastMessage, a.lastRunId], ['needs_approval', true, 'c'.repeat(64), 2, 'Email the notes', 'run-7']);
  assert.deepEqual(b, v1[1]); assert.equal(mergeRoster(v1, null), v1, 'a failed roster keeps the v1 values');
  assert.equal(STATUS_WORDS.needs_approval, 'Needs your approval'); assert.equal(STATUS_WORDS.needs_signin, 'Needs you to sign in');
});

test('a v2 send names its attachments by id and replays the same body', async () => {
  const pending = runPending(uuid(1), 'Summarise the attached notes.', () => 'key-00000001', ['att-1', 'att-2']);
  assert.deepEqual(JSON.parse(pending.quote), { agentId: uuid(1), idempotencyKey: 'key-00000001', prompt: 'Summarise the attached notes.', attachments: [{ id: 'att-1' }, { id: 'att-2' }] });
  assert.equal(isRunPending(pending), true);
  assert.deepEqual(JSON.parse(runPending(uuid(1), 'No files.', () => 'key-00000002').quote).attachments, []);
  const bodies = []; let fail = true;
  const api = async (path, body) => { bodies.push(body); if (fail) { fail = false; throw new Error('Connection interrupted. Refresh to check the outcome.'); }
    return { run: { id: 'run-1', agentId: uuid(1), conversationId: 'c', conversationSeq: 1, idempotencyKey: 'key-00000001', state: 'running', stateReason: null, terminal: false, prompt: body.prompt, answer: null, eventCursor: 0, actions: [], createdAt: '2026-09-30T12:00:00Z' } }; };
  await assert.rejects(submitRunPending(api, pending, () => {}), /interrupted/);
  assert.equal((await submitRunPending(api, pending, () => {})).id, 'run-1');
  assert.deepEqual(bodies[1], bodies[0]); assert.deepEqual(bodies[0].attachments, [{ id: 'att-1' }, { id: 'att-2' }]);
});

test('a v2 turn shows its files, the server-named provider and account, and no token cost', () => {
  const run = { id: 'run-1', agentId: uuid(1), conversationId: 'c', conversationSeq: 1, idempotencyKey: 'key-00000001', state: 'completed', stateReason: null, terminal: true, prompt: 'Read this', answer: 'Done.',
    fundingSource: 'connected_account', attachments: [{ id: 'att-1', name: 'notes.txt', mimeType: 'text/plain', size: 2048 }], eventCursor: 1, createdAt: '2026-09-30T12:00:00Z',
    actions: [{ id: 'act-1', callId: 'c1', tool: 'outlook_mail_send', kind: 'write', provider: 'outlook_mail', account: 'me@acme.com', connectionId: 'conn', state: 'completed', summary: null, arguments: {}, fingerprint: null, expiresAt: null, receipt: { status: 'confirmed', summary: 'Sent' } }] };
  const turn = runTurn(run);
  assert.equal(turn.fundingSource, 'connected_account');
  assert.deepEqual(turn.attachments, [{ id: 'att-1', kind: 'text', name: 'notes.txt', bytes: 2048 }]);
  assert.deepEqual([turn.tools[0].integration, turn.tools[0].account], ['outlook_mail', 'me@acme.com']);
  const old = runTurn({ ...run, actions: [{ ...run.actions[0], provider: undefined, account: undefined, tool: 'google_calendar_list_events' }] });
  assert.equal(old.tools[0].integration, '', 'a tool name is never guessed into a provider');
});

test('creating from a starter keeps one id until a response, then remembers the starter', async () => {
  const s = store(), attempts = [];
  let failures = 1;
  const client = { fromTemplate: async (key, id) => { attempts.push([key, id]); if (failures-- > 0) throw new Error('Connection interrupted. Refresh to check the outcome.'); return { id, name: 'Morning brief' }; } };
  await assert.rejects(createFromTemplate(client, s, 'me@example.test', 'morning_brief', () => 'id-one'), /interrupted/);
  const teammate = await createFromTemplate(client, s, 'me@example.test', 'morning_brief', () => 'never-used');
  assert.deepEqual(attempts, [['morning_brief', 'id-one'], ['morning_brief', 'id-one']]);
  assert.equal(teammate.id, 'id-one');
  assert.deepEqual([...s.m.keys()], [`agent-template.me%40example.test.id-one`], 'the pending id is gone, the starter is remembered');
  assert.deepEqual(JSON.parse(s.m.values().next().value), { key: 'morning_brief' });
  // A definitive refusal releases the id so the next try starts fresh.
  const refusing = { fromTemplate: async () => { throw new Error('402: Agents need Pro.'); } };
  await assert.rejects(createFromTemplate(refusing, s, 'me@example.test', 'pr_shepherd', () => 'id-two'), /402/);
  assert.equal(s.m.has('teammate-template-create.me%40example.test.pr_shepherd'), false);
});
