import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VibesError } from '../src/vibes/api';
import type { VibesApi } from '../src/vibes/types';
import type { Teammate } from '../src/agents/types';
import { createOverviewApi } from '../src/agents/v2/overviewApi';
import { isStaleCursor, mergeRoster, newDeviceId, parseRoster, parseUpload, shouldMarkRead, uploadProblem } from '../src/agents/v2/overviewModel';
import { providerName, toolWords } from '../src/agents/v2/providerLabels';
import { applyEvents, emptyFeed, runBody, runNotice, runToTurn, type Run } from '../src/agents/v2/runCore';
import { runChatApi } from '../src/agents/v2/runChat';
import { RunError, type RunsApi } from '../src/agents/v2/runsApi';
import { parseTemplates, recurrenceWords, scheduleSeed, suggestedOperations, triggerSeed } from '../src/agents/v2/templatesModel';

const planRaw = () => ({ agentId: 'agent-1', ready: true, maxTools: 10, runtime: { ok: true }, services: [], tools: [], approvals: [], dropped: [], mentioned: [], missing: [] });
const item = () => ({ id: 'r1', runId: 'run1', agentId: 'agent-1', tool: 'gmail_send', provider: 'gmail', createdAt: '2026-09-30T12:00:00+00:00' });
const team = (patch: Partial<Teammate> = {}) => ({ id: 'agent-1', chatId: 'chat-1', revision: 1, name: 'Sam', brief: '', memory: '', avatar: 'assistant', budget: 5, integrations: [],
  archived: false, status: 'idle', lastMessage: 'old', updatedAt: '2026-09-30T12:00:00Z', lastRunId: null, model: 'auto', skillIds: [], ...patch }) as Teammate;
const row = (patch: Record<string, unknown> = {}) => ({ agentId: 'agent-1', name: 'Sam', avatar: 'assistant', brief: 'b', archived: false, status: 'waiting_for_approval',
  waitingApprovalCount: 2, lastRun: { id: 'run-9', state: 'waiting_for_approval', stateReason: null, terminal: false, conversationSeq: 4, preview: 'Email the notes', createdAt: 'x', finishedAt: null },
  readCursor: 'a'.repeat(64), unread: true, fundingSource: 'connected_account', updatedAt: 'x', ...patch });

test('roster: v2 status, approvals and unread replace the v1 values; other teammates keep theirs', () => {
  const rows = parseRoster({ teammates: [row(), row({ agentId: 'other', status: 'running', readCursor: null, unread: false, lastRun: null })] })!;
  const merged = mergeRoster([team(), team({ id: 'solo', status: 'completed', unread: true, lastMessage: 'v1' })], rows);
  assert.deepEqual([merged[0]!.status, merged[0]!.unread, merged[0]!.readCursor, merged[0]!.pendingDecisionCount, merged[0]!.lastMessage, merged[0]!.lastRunId],
    ['needs_approval', true, 'a'.repeat(64), 2, 'Email the notes', 'run-9']);
  assert.deepEqual([merged[1]!.status, merged[1]!.unread, merged[1]!.lastMessage], ['completed', true, 'v1']);
  assert.equal(mergeRoster([team()], null)[0]!.status, 'idle', 'a failed summary leaves the v1 roster alone');
  assert.equal(parseRoster({ teammates: [row({ readCursor: 'not-hex' })] })![0]!.readCursor, null);
  assert.deepEqual(['waiting_for_computer', 'waiting_for_signin', 'paused_by_limits', 'outcome_unknown', 'running'].map(s => mergeRoster([team()], parseRoster({ teammates: [row({ status: s })] }))[0]!.status),
    ['computer_offline', 'needs_signin', 'paused', 'outcome_unknown', 'running']);
});

test('read markers: mark only an unread, unmarked cursor; a 409 is stale; ids stay within the header’s rules', () => {
  assert.ok(shouldMarkRead({ unread: true, readCursor: 'c' }, null));
  assert.ok(!shouldMarkRead({ unread: true, readCursor: 'c' }, 'c'));
  assert.ok(!shouldMarkRead({ unread: false, readCursor: 'c' }, null));
  assert.ok(!shouldMarkRead({ unread: true, readCursor: null }, null));
  assert.ok(isStaleCursor(409, 'stale_cursor') && isStaleCursor(409, null) && !isStaleCursor(409, 'other') && !isStaleCursor(500));
  assert.match(newDeviceId('ios', '123e4567-e89b-12d3-a456-426614174000'), /^[A-Za-z0-9._:-]{1,64}$/);
  assert.equal(newDeviceId('ios', 'x'.repeat(100)).length, 64);
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
test('overview client: device header only on roster and read; stale cursor is reported, not thrown', async () => {
  const calls: { url: string; method: string; device: string | null; body: any }[] = [];
  const fetcher = (async (url: any, init: any) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), method: init?.method ?? 'GET', device: headers.get('X-Vibyra-Device'), body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body });
    const u = String(url);
    if (u.endsWith('/roster')) return json({ teammates: [row()] });
    if (u.endsWith('/read')) return json({ ok: false, code: 'stale_cursor', error: 'This conversation changed.' }, 409);
    if (u.endsWith('/runs/preview')) return json({ plan: planRaw() });
    if (u.includes('/activity')) return json({ items: [item()], nextCursor: null });
    if (u.endsWith('/templates')) return json({ templates: [] });
    if (u.includes('/templates/')) return json({ teammate: team(), template: {} }, 201);
    if (u.endsWith('/attachments')) return json({ attachment: { id: 'att-1', kind: 'pdf', name: 'a.pdf', mimeType: 'application/pdf', size: 1234, sha256: 'f'.repeat(64) } }, 201);
    return json({}, 404);
  }) as typeof fetch;
  const api = createOverviewApi('https://example.test', () => 'tok', fetcher, async () => 'ios-device-1');
  assert.equal((await api.roster()).length, 1);
  assert.equal(await api.markRead('agent-1', 'c'.repeat(64)), 'stale');
  assert.equal((await api.plan({ agentId: 'agent-1', prompt: 'Triage my inbox', attachments: ['att-1'] }, 'abcdef123456')).ready, true);
  await api.activity({ provider: 'gmail', limit: 10 });
  await api.templates();
  assert.equal((await api.fromTemplate('inbox_triage', '123e4567-e89b-12d3-a456-426614174000')).id, 'agent-1');
  const file = new File([new Uint8Array(1234)], 'a.pdf', { type: 'application/pdf' });
  assert.deepEqual(await api.upload({ uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf', file }), { id: 'att-1', kind: 'pdf', name: 'a.pdf', bytes: 1234 });
  assert.deepEqual(calls.map(c => [c.method, c.url.replace('https://example.test/api/', ''), c.device]), [
    ['GET', 'agents/v2/roster', 'ios-device-1'], ['POST', 'agents/v2/agents/agent-1/read', 'ios-device-1'],
    ['POST', 'agents/v2/runs/preview', null], ['GET', 'agents/v2/activity?limit=10&provider=gmail', null], ['GET', 'agents/v2/templates', null],
    ['POST', 'agents/v2/templates/inbox_triage/teammates', null], ['POST', 'agents/v2/attachments', null]]);
  assert.deepEqual(calls[2]!.body.attachments, [{ id: 'att-1' }]);
  assert.match(calls[2]!.body.idempotencyKey, /^preview-[A-Za-z0-9._:-]{8,}$/);
  assert.ok(calls[6]!.body instanceof FormData, 'the upload is multipart');
  await assert.rejects(api.upload({ uri: 'x', name: 'movie.mov', mimeType: 'video/quicktime', file: new File([new Uint8Array(3)], 'movie.mov', { type: 'video/quicktime' }) }), /photo, a PDF or a text file/);
  assert.equal(uploadProblem('big.pdf', 'application/pdf', 3 * 1024 * 1024), 'Attach a file under 2 MB.');
  assert.equal(uploadProblem('notes.md', '', 10), null);
  assert.deepEqual(parseUpload({ attachment: { id: 'x', kind: 'image', name: 'p.jpg', mimeType: 'image/jpeg', size: 9 } }), { id: 'x', kind: 'image', name: 'p.jpg', bytes: 9, mimeType: 'image/jpeg' });
});

const run = (patch: Partial<Run> = {}): Run => ({ id: 'run-1', agentId: 'agent-1', conversationId: 'chat-1', conversationSeq: 1, idempotencyKey: 'send-key-1', state: 'running', stateReason: null,
  terminal: false, prompt: 'Summarise', answer: null, runtime: { provider: 'claude', model: 'm' }, eventCursor: 0, actions: [], createdAt: '2026-09-30T12:00:00+00:00', ...patch });
const base = { turns: async () => [], turn: async () => { throw new VibesError('Not found', 404); }, cancel: async () => {}, upload: async () => { throw new Error('v1 upload must not be used'); } } as unknown as VibesApi;
const memory = () => { let value: string | null = null; return { read: async () => value, write: async (v: string) => { value = v; }, get: () => value }; };
const runsStub = (patch: Partial<RunsApi>): RunsApi => ({ probe: async () => ({ mode: 'v2', final: true }), admit: async () => run(), list: async () => [], run: async () => run(),
  events: async () => ({ events: [], nextCursor: 0, state: 'running', terminal: false, latestSeq: 0 }), cancel: async () => run({ state: 'cancelled', terminal: true }), decide: async () => {}, ...patch });

test('v2 chat: uploads go to the v2 store, the admission body names them by id, and the replay is identical', async () => {
  const bodies: any[] = []; const uploads: string[] = [];
  const agent = { id: 'agent-1', chatId: 'chat-1' } as Teammate;
  const api = runChatApi(base, runsStub({ admit: async body => { bodies.push(body); return run({ idempotencyKey: body.idempotencyKey, prompt: body.prompt, attachments: [{ id: 'att-1', name: 'a.pdf', mimeType: 'application/pdf', size: 12 }] }); } }),
    agent, memory(), { upload: async source => { uploads.push(source.name); return { id: 'att-1', kind: 'pdf', name: source.name, bytes: 12 }; } });
  assert.equal((await api.upload!({ uri: 'u', name: 'a.pdf', mimeType: 'application/pdf' })).id, 'att-1');
  const quote = await api.quote('chat-1', 'Summarise the PDF', 'auto', null, [], ['att-1']);
  const turn = await api.submit('send-key-9', quote.quote);
  assert.deepEqual(bodies[0], { agentId: 'agent-1', prompt: 'Summarise the PDF', attachments: [{ id: 'att-1' }], idempotencyKey: 'send-key-9' });
  assert.deepEqual(uploads, ['a.pdf']);
  assert.deepEqual(turn.attachments, [{ id: 'att-1', kind: 'pdf', name: 'a.pdf', bytes: 12 }]);
  assert.equal(turn.fundingSource, 'connected_account');
  assert.deepEqual(runBody('a', 'k', 'p', ['f']).attachments, [{ id: 'f' }]);
});

test('v2 chat: a refusal with a server fix says the fix, in its words', async () => {
  const agent = { id: 'agent-1', chatId: 'chat-1' } as Teammate;
  const fix = { action: 'choose_ai_account', message: 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.' };
  const api = runChatApi(base, runsStub({ admit: async () => { throw new RunError('Teammates run on an AI account you choose on your Mac, and none is selected yet.', 409, 'runtime_required', fix); } }), agent, memory());
  const quote = await api.quote('chat-1', 'Hello', 'auto');
  await assert.rejects(api.submit('send-key-7', quote.quote), (e: VibesError) => e.message === fix.message);
});

test('provider words come from the server: event payloads name what is in use; nothing is guessed from tool names', () => {
  let feed = applyEvents(emptyFeed(), [{ seq: 1, type: 'tool.requested', payload: { actionId: 'a1', callId: 'c', tool: 'google_calendar_list_events', kind: 'read', connectionId: 'c1', provider: 'google_calendar' } }]);
  assert.deepEqual(feed.using, { provider: 'google_calendar', tool: 'google_calendar_list_events' });
  assert.equal(runNotice(run(), feed), 'Using Google Calendar…');
  assert.equal(runNotice(run(), { ...feed, status: 'Reading your week' }), 'Reading your week');
  feed = applyEvents(feed, [{ seq: 2, type: 'tool.result', payload: { actionId: 'a1', tool: 'google_calendar_list_events', provider: 'google_calendar', status: 'confirmed' } }]);
  assert.equal(feed.using, null);
  assert.deepEqual(feed.providers, { a1: 'google_calendar' });
  const turn = runToTurn(run({ actions: [{ id: 'a1', callId: 'c', tool: 'google_calendar_list_events', kind: 'read', connectionId: 'c1', state: 'completed', summary: null }] }), feed);
  assert.equal(turn.tools[0]!.integration, 'google_calendar', 'an action with no provider field uses the journal’s own event');
  assert.equal(runToTurn(run({ actions: [{ id: 'z', callId: 'c', tool: 'slack_post_message', kind: 'read', connectionId: null, state: 'completed', summary: null }] })).tools[0]!.integration, '');
  assert.deepEqual([providerName('gmail'), providerName('mcp_0123abcd'), providerName('google_tasks'), providerName(null), providerName('some_new_thing')], ['Gmail', 'Remote tools', 'Google Tasks', 'A connected service', 'Some new thing']);
  assert.deepEqual([toolWords('gmail_send', 'gmail'), toolWords('mcp_0123abcd__create_row', 'mcp_0123abcd'), toolWords('github_list_pull_requests', 'github')], ['Send', 'Create row', 'List pull requests']);
});

const templateRaw = (key: string, patch: Record<string, unknown> = {}) => ({ key, name: 'Morning brief', avatar: 'lead', brief: 'Each morning…', autoGrant: false,
  suggested: { providers: [{ provider: 'gmail', name: 'Gmail', operations: [{ tool: 'gmail_search', kind: 'read' }, { tool: 'gmail_send', kind: 'write' }], why: 'Reads mail.', connected: false }],
    schedule: { recurrence: { type: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '08:00' }, prompt: 'Write my morning brief for today.' },
    trigger: { kind: 'gmail.message', filter: { query: 'is:unread', pollMinutes: 5 }, promptTemplate: 'A new email arrived.' }, ...patch } });
test('templates: suggestions parse, seed the editors, and never carry a grant', () => {
  const [t, bad] = [parseTemplates({ templates: [templateRaw('morning_brief')] })[0]!, parseTemplates({ templates: [templateRaw('Bad Key')] })];
  assert.equal(bad.length, 0);
  assert.deepEqual(scheduleSeed(t), { type: 'weekly', time: '08:00', prompt: 'Write my morning brief for today.', weekdays: [1, 2, 3, 4, 5] });
  const trigger = triggerSeed(t)!;
  assert.deepEqual([trigger.kind, trigger.query, trigger.pollMinutes, trigger.promptTemplate], ['gmail.message', 'is:unread', 5, 'A new email arrived.']);
  assert.equal(recurrenceWords(t.schedule!.recurrence), 'Weekdays at 08:00');
  assert.deepEqual(suggestedOperations(t, 'gmail'), ['gmail_search', 'gmail_send']);
  assert.deepEqual(suggestedOperations(t, 'github'), []);
  assert.equal(suggestedOperations(null, 'gmail').length, 0);
  assert.equal(scheduleSeed({ ...t, schedule: null }), null);
  const gh = parseTemplates({ templates: [templateRaw('pr_shepherd', { trigger: { kind: 'github.pull_request', filter: { actions: ['opened', 'ready_for_review'] }, promptTemplate: 'PR opened.' }, schedule: null })] })[0]!;
  assert.equal(triggerSeed(gh)!.actions, 'opened, ready_for_review');
});
