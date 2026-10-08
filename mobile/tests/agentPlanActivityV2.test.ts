import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityPath, mergeActivity, outcomePill, parseActivity, safeLink, serviceFilters, timeWords } from '../src/agents/v2/activityModel';
import { droppedLine, gapRows, parsePlan, planBody, planIsQuiet, planKey, planSummary, serviceRows, worthPlanning } from '../src/agents/v2/planModel';

const gmail = { provider: 'gmail', name: 'Gmail', connectionId: 'c1', account: 'work@acme.com' };
const planRaw = (patch: Record<string, unknown> = {}) => ({ agentId: 'agent-1', fundingSource: 'connected_account', ready: true, maxTools: 10,
  runtime: { ok: true, provider: 'claude', model: 'sonnet' },
  services: [{ ...gmail, score: 100, reads: ['gmail_search', 'gmail_read'], writes: ['gmail_send'] }],
  tools: [{ tool: 'gmail_search', provider: 'gmail', connectionId: 'c1', account: 'work@acme.com', kind: 'read', requiresApproval: false },
    { tool: 'gmail_send', provider: 'gmail', connectionId: 'c1', account: 'work@acme.com', kind: 'write', requiresApproval: true }],
  approvals: [{ tool: 'gmail_send', provider: 'gmail', connectionId: 'c1', account: 'work@acme.com', kind: 'write', requiresApproval: true }],
  dropped: [], mentioned: ['gmail'], missing: [], ...patch });

test('plan: services, approvals and the one-line summary; dropped tools are explained', () => {
  const plan = parsePlan(planRaw({ dropped: [{ tool: 'github_create_issue', provider: 'github', connectionId: 'c2', account: 'octo', kind: 'write', requiresApproval: true }] }))!;
  assert.deepEqual(serviceRows(plan).map(r => [r.name, r.account, r.line]), [['Gmail', 'work@acme.com', 'Reads: search, read · Asks first: send']]);
  assert.deepEqual(planSummary(plan), { text: 'Can use Gmail · 1 action asks first', tone: 'ok' });
  assert.match(droppedLine(plan)!, /1 tool was left out.*under 10 tools/);
  assert.equal(droppedLine(parsePlan(planRaw())!), null);
  assert.deepEqual(planSummary(parsePlan(planRaw({ services: [], tools: [], approvals: [] }))!), { text: 'Won’t use any connected service', tone: 'muted' });
  assert.equal(parsePlan({ nope: true }), null);
  assert.ok(planIsQuiet(parsePlan(planRaw({ services: [], tools: [], approvals: [] }))!), 'a plan with nothing to report shows nothing');
  assert.ok(!planIsQuiet(plan));
});

test('plan gaps: each names its one fix, blocking first, and only real buttons get a label', () => {
  const plan = parsePlan(planRaw({ ready: false, missing: [
    { provider: 'github', name: 'GitHub', reason: 'over_cap', blocking: false, message: 'Only 10 tools fit one task.', connectionId: 'c2', account: 'octo',
      fix: { action: 'mention', method: null, path: null, message: 'Name GitHub in the task.' } },
    { provider: 'gmail', name: 'Gmail', reason: 'not_connected', blocking: true, message: 'No Gmail account is connected.', connectionId: null, account: null,
      fix: { action: 'connect', method: 'POST', path: '/api/agents/v2/connections/gmail/start', message: 'Connect Gmail in Connections.' } },
    { provider: 'slack', name: 'Slack', reason: 'unavailable', blocking: true, message: 'Slack is not available yet.', connectionId: null, account: null, fix: null },
    { provider: 'notion', name: 'Notion', reason: 'not_granted', blocking: true, message: 'x', connectionId: 'c3', account: 'me', accounts: [{ connectionId: 'c3', account: 'me' }],
      fix: { action: 'grant', method: 'PUT', path: '/api/agents/v2/agents/a/grants/c3', message: 'Choose what it may do with me.' } },
    { provider: 'linear', name: 'Linear', reason: 'reconnect_required', blocking: false, message: 'y', connectionId: 'c4', account: 'l@x.com',
      fix: { action: 'reconnect', method: 'POST', path: '/api/agents/v2/connections/linear/start', message: 'Reconnect Linear in Connections.' } }] }))!;
  const rows = gapRows(plan);
  assert.deepEqual(rows.map(r => [r.blocking, r.step.kind, r.step.label]), [[true, 'connect', 'Connect Gmail'], [true, 'words', ''], [true, 'grant', 'Choose access'],
    [false, 'words', ''], [false, 'reconnect', 'Reconnect Linear']]);
  assert.equal(rows[1]!.message, 'Slack is not available yet.');
  assert.deepEqual([rows[2]!.message, rows[2]!.hint], ['x', 'Choose what it may do with me.']);
  assert.equal(rows[0]!.hint, null, 'a button that says the fix needs no second sentence');
  assert.deepEqual([rows[3]!.message, rows[3]!.hint], ['Only 10 tools fit one task.', 'Name GitHub in the task.']);
  assert.deepEqual(planSummary(plan), { text: '3 things need setup', tone: 'warn' });
});

test('plan: a missing AI account shows the server fix words first, with the Mac-only action named', () => {
  const plan = parsePlan(planRaw({ ready: false, runtime: { ok: false, code: 'runtime_required', message: 'Teammates run on an AI account you choose on your Mac.',
    fix: { action: 'choose_ai_account', message: 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.' } }, services: [], tools: [], approvals: [] }))!;
  const [first] = gapRows(plan);
  assert.equal(first!.hint, 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.');
  assert.equal(first!.message, 'Teammates run on an AI account you choose on your Mac.');
  assert.equal(first!.step.kind, 'choose_ai_account');
  assert.equal(planSummary(plan).tone, 'warn');
  assert.ok(worthPlanning('Hi!') && !worthPlanning(' a '));
  assert.notEqual(planKey({ agentId: 'a', prompt: 'x ', attachments: [] }), planKey({ agentId: 'a', prompt: 'x', attachments: ['f1'] }));
  assert.deepEqual(planBody({ agentId: 'a', prompt: 'p', attachments: ['f1'] }, 'preview-abc12345'), { agentId: 'a', idempotencyKey: 'preview-abc12345', prompt: 'p', attachments: [{ id: 'f1' }] });
});

const item = (patch: Record<string, unknown> = {}) => ({ id: 'r1', actionId: 'a1', runId: 'run1', agentId: 'agent-1', agentName: 'Sam', tool: 'gmail_send', kind: 'write',
  provider: 'gmail', connectionId: 'c1', accountLabel: 'work@acme.com', status: 'confirmed', outcome: 'confirmed', actionState: 'completed', summary: 'Sent to team',
  providerResourceId: 'm1', url: 'https://mail.google.com/mail/u/0/#sent/abc', createdAt: '2026-09-30T12:00:00+00:00', updatedAt: null, ...patch });

test('activity: parse, query shape, dedupe on load more, pills and time words', () => {
  const page = parseActivity({ items: [item(), { nope: 1 }, item({ id: 'r2', outcome: 'rate_limited', status: 'failed' })], nextCursor: 'abc_-123' })!;
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, 'abc_-123');
  assert.equal(parseActivity({ items: [], nextCursor: 'has space' })!.nextCursor, null);
  assert.equal(parseActivity({}), null);
  assert.equal(activityPath(), 'agents/v2/activity?limit=30');
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(activityPath({ provider: 'gmail', agentId: uuid, cursor: 'abc', limit: 500 }), `agents/v2/activity?limit=100&provider=gmail&agentId=${uuid}&cursor=abc`);
  assert.equal(activityPath({ provider: 'Gm ail&x=1', agentId: 'nope', cursor: 'a b' }), 'agents/v2/activity?limit=30', 'anything malformed is dropped, never sent');
  assert.deepEqual(mergeActivity(page.items, [page.items[1]!, { ...page.items[0]!, id: 'r3' }]).map(i => i.id), ['r1', 'r2', 'r3']);
  assert.deepEqual([outcomePill({ status: 'confirmed', outcome: 'confirmed' }), outcomePill({ status: 'unknown', outcome: null }), outcomePill({ status: 'failed', outcome: 'refused' })],
    [{ label: 'Done', tone: 'ok' }, { label: 'Unconfirmed', tone: 'warn' }, { label: 'Refused', tone: 'error' }]);
  const now = Date.parse('2026-09-30T12:30:00+00:00');
  assert.deepEqual([timeWords('2026-09-30T12:29:30+00:00', now), timeWords('2026-09-30T12:00:00+00:00', now), timeWords('2026-09-30T09:30:00+00:00', now), timeWords('bad', now)],
    ['Just now', '30 min ago', '3 h ago', '']);
  assert.deepEqual(serviceFilters(['slack', 'gmail'], page.items, 'github'), ['github', 'gmail', 'slack']);
});

test('activity: only an https address on the provider’s own host is ever a link', () => {
  const ok = (url: string, provider: string) => safeLink(url, provider) === url;
  assert.ok(ok('https://mail.google.com/mail/u/0/#inbox/x', 'gmail'));
  assert.ok(ok('https://github.com/acme/app/issues/3#issuecomment-9', 'github'));
  assert.ok(ok('https://acme.slack.com/archives/C1/p1', 'slack'));
  assert.ok(ok('https://www.google.com/calendar/event?eid=abc', 'google_calendar'));
  for (const [url, provider] of [
    ['http://github.com/a/b', 'github'], ['javascript:alert(1)', 'github'], ['https://github.com.evil.example/x', 'github'], ['https://evilgithub.com/x', 'github'],
    ['https://user:pw@github.com/x', 'github'], ['https://github.com@evil.example/x', 'github'], ['https://github.com/x y', 'github'], ['https://github.com/"onmouseover', 'github'],
    ['https://www.google.com/search?q=x', 'google_calendar'], ['https://mail.google.com/x', 'github'], ['https://github.com/x', 'computer'], ['https://github.com:8443/x', 'github'],
    ['//github.com/x', 'github'], ['https://github.com/x\u0000', 'github'], ['data:text/html,<b>', 'github'], ['', 'github'], ['https://notion.so/x', 'unknown'],
  ] as const) assert.equal(safeLink(url, provider), null, `${provider} ${JSON.stringify(url)}`);
  assert.equal(safeLink(null, 'gmail'), null);
});
