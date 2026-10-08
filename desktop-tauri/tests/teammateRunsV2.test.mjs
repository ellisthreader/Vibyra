import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRun, isRunPending, loadRunTurns, probeRuns, runPending, statusOf, submitRunPending, runTurn } from '../src/components/teammates/runsV2.ts';

const run = (patch = {}) => ({ id: 'run-1', agentId: 'agent-1', conversationId: 'chat-1', conversationSeq: 1, idempotencyKey: 'key-00000001',
  state: 'running', stateReason: null, terminal: false, prompt: 'Summarise my inbox', answer: null, runtime: { model: 'gpt-test' },
  eventCursor: 0, actions: [], createdAt: '2026-09-30T12:00:00+00:00', ...patch });
const pending = runPending('agent-1', 'Summarise my inbox', () => 'key-00000001');

test('the pending v2 send is the exact admission body under its own key', () => {
  assert.deepEqual(JSON.parse(pending.quote), { agentId: 'agent-1', idempotencyKey: 'key-00000001', prompt: 'Summarise my inbox', attachments: [] });
  assert.equal(isRunPending(pending), true);
  assert.equal(isRunPending({ id: 'x', quote: 'signed-v1-quote', text: 'hi' }), false);
});

test('an uncertain send keeps the pending body; the retry replays it identically', async () => {
  const bodies = []; let released = 0, fail = true;
  const api = async (path, body) => { if (path === 'agents/v2/runs') { bodies.push(body); if (fail) { fail = false; throw new Error('Connection interrupted. Refresh to check the outcome.'); } return { run: run() }; } throw new Error(`unexpected ${path}`); };
  await assert.rejects(submitRunPending(api, pending, () => released++), /interrupted/);
  assert.equal(released, 0);
  assert.equal((await submitRunPending(api, pending, () => released++)).id, 'run-1');
  assert.deepEqual(bodies[1], bodies[0]); assert.equal(bodies[0].idempotencyKey, pending.id);
});

test('a 4xx releases only after the conversation shows no run with the key', async () => {
  for (const [runs, expectRelease] of [[[], 1], [[run()], 0]]) {
    let released = 0;
    const api = async path => { if (path === 'agents/v2/runs') throw new Error('409: Open Vibyra on your Mac.'); return { runs }; };
    const result = submitRunPending(api, pending, () => released++);
    if (expectRelease) await assert.rejects(result, /409/); else assert.equal((await result).id, 'run-1');
    assert.equal(released, expectRelease);
  }
  let released = 0;
  await assert.rejects(submitRunPending(async path => { throw new Error(path === 'agents/v2/runs' ? '429: Slow down' : 'offline'); }, pending, () => released++));
  assert.equal(released, 0, 'an unconfirmed absence keeps the send');
});

test('history replays events from each run cursor and maps states', async () => {
  const afters = [], feeds = new Map();
  const pages = [[{ seq: 1, type: 'message.delta', payload: { text: 'Hi ' } }, { seq: 2, type: 'message.delta', payload: { text: 'there' } }], []];
  const api = async path => {
    if (path.startsWith('agents/v2/runs?agentId=agent-1&limit=20')) return { runs: [run(), run({ id: 'run-0', state: 'waiting_for_computer', createdAt: '2026-09-30T11:00:00+00:00' })] };
    const after = Number(/after=(\d+)/.exec(path)[1]); afters.push([path.split('/')[3], after]);
    const events = path.includes('run-1') ? pages.shift() ?? [] : [];
    return { events, nextCursor: after + events.length, state: 'running', terminal: false, latestSeq: after + events.length };
  };
  let result = await loadRunTurns(api, 'agent-1', 'chat-1', feeds);
  assert.deepEqual(result.turns.map(t => t.id), ['run-0', 'run-1']);
  assert.equal(result.turns[1].response, 'Hi there'); assert.equal(result.turns[0].status, 'queued');
  assert.match(result.turns[0].notice, /Waiting for your Mac/); assert.equal(result.delay, 1000);
  result = await loadRunTurns(api, 'agent-1', 'chat-1', feeds);
  assert.deepEqual(afters.filter(([id]) => id === 'run-1').map(([, a]) => a), [0, 2]);
  assert.equal(runTurn(run({ state: 'outcome_unknown', terminal: true })).status, 'failed');
});

test('approval re-reads the run and posts the same fingerprint, refusing a changed one', async () => {
  const action = (fp) => ({ id: 'act-1', callId: 'c', tool: 'gmail_send', kind: 'write', connectionId: 'conn', state: 'pending_approval', summary: null,
    arguments: { to: 'a@example.com' }, fingerprint: fp, expiresAt: new Date(Date.now() + 60000).toISOString(), receipt: null });
  const shown = runTurn(run({ state: 'waiting_for_approval', actions: [action('a'.repeat(64))] }));
  let server = 'a'.repeat(64); const posts = [];
  const api = async (path, body) => { if (body) { posts.push([path, body]); return { action: {} }; } return { run: run({ state: 'waiting_for_approval', actions: [action(server)] }) }; };
  await decideRun(api, shown, shown.tools[0], 'allow');
  assert.deepEqual(posts, [['agents/v2/actions/act-1/decision', { fingerprint: 'a'.repeat(64), decision: 'allow' }]]);
  server = 'b'.repeat(64);
  await assert.rejects(decideRun(api, shown, shown.tools[0], 'decline'), /changed or expired/); assert.equal(posts.length, 1);
});

test('selection: v2 only when the account v2 route answers', async () => {
  assert.deepEqual(await probeRuns(async () => ({ runtimes: [] })), { mode: 'v2', final: true });
  for (const [error, final] of [['403: Not in cohort', true], ['503: Disabled', true], ['404: Not found', true], ['Connection interrupted', false]])
    assert.deepEqual(await probeRuns(async () => { throw new Error(error); }), { mode: 'v1', final });
  assert.equal(statusOf('409: x'), 409); assert.equal(statusOf(new Error('offline')), null);
});

test('native approval does not POST when a same-fingerprint response changes the reviewed destination', async () => {
  const action = { id: 'act-1', callId: 'c', tool: 'gmail_send', kind: 'write', provider: 'gmail',
    connectionId: 'conn', account: 'qa@example.test', state: 'pending_approval', summary: null,
    arguments: { to: 'qa@example.test', subject: 'Review', body: 'Exact message' }, fingerprint: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60000).toISOString(), receipt: null };
  const displayed = run({ state: 'waiting_for_approval', actions: [action] }), shown = runTurn(displayed);
  for (const patch of [{ account: 'other@example.test' }, { connectionId: 'other' }, { arguments: { ...action.arguments, to: 'other@example.test' } }, { state: 'approved' }]) {
    const posts = [];
    const api = async (_path, body) => { if (body) posts.push(body); return { run: { ...displayed, actions: [{ ...action, ...patch }] } }; };
    await assert.rejects(decideRun(api, shown, shown.tools[0], 'allow'), /changed or expired/);
    assert.equal(posts.length, 0);
  }
});
