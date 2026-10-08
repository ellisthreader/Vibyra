import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConnectionsApi } from '../src/agents/v2/connectionsApi';
import { parseCatalogue, parseConnection, parseMcpServer, type CatalogueProvider, type McpServer } from '../src/agents/v2/connectionsModel';
import {
  GRANT_WORDS, STATUS_PILL, accountTitle, catalogueLine, connectable, grantState, groupAccounts, lastUsedLine, mcpUrlProblem,
  markableReads, needsReview, operationsFor, readsOn, reviewSummary, teammatesLine, toggleOperation, toolLabel, unavailableReason,
} from '../src/agents/v2/hubModel';

const id = '123e4567-e89b-42d3-a456-000000000001';
const conn = (extra: Record<string, unknown> = {}) => parseConnection({ id, provider: 'gmail', account: 'a@x.test', health: 'healthy', generation: 2,
  source: 'install', createdAt: '2026-09-30T00:00:00Z', status: 'ok', name: 'Gmail', accountLabel: 'a@x.test', email: 'a@x.test', ...extra })!;
const catalogue: CatalogueProvider[] = parseCatalogue([
  { provider: 'gmail', name: 'Gmail', kind: 'builtin', connect: ['oauth'], readiness: 'ready',
    tools: [{ tool: 'gmail_search', kind: 'read' }, { tool: 'gmail_read', kind: 'read' }, { tool: 'gmail_send', kind: 'write' }] },
  { provider: 'slack', name: 'Slack', kind: 'builtin', connect: ['oauth'], readiness: 'unavailable', reason: 'credentials_missing', tools: [] },
  { provider: 'notion', readiness: 'unavailable', reason: 'something_new', message: 'Notion is paused.' },
  { provider: 'composio_airtable', kind: 'composio', connect: ['composio'], readiness: 'ready', tools: [] },
  { name: 'no provider' },
]);

test('status pills name every hub status plainly', () => {
  assert.deepEqual(Object.values(STATUS_PILL).map(p => p.label),
    ['Connected', 'Reconnect needed', 'Needs more access', 'Changed — review', 'Not set up']);
  assert.equal(conn({ status: 'weird', health: 'reconnect_required' }).status, 'reconnect_required', 'an older server falls back to health');
  assert.equal(parseConnection({ provider: 'gmail' }), null);
});

test('catalogue readiness: unavailable providers explain themselves and are never connectable', () => {
  assert.equal(catalogue.length, 4);
  assert.equal(unavailableReason(catalogue[0]!), null);
  assert.equal(connectable(catalogue[0]!), true);
  assert.equal(unavailableReason(catalogue[1]!), 'Vibyra hasn’t finished setting up sign-in for this service yet.');
  assert.equal(unavailableReason(catalogue[2]!), 'Notion is paused.');
  assert.equal(connectable(catalogue[3]!), false, 'composio links are not started from the apps');
  assert.equal(catalogueLine(catalogue[0]!), '2 reads · 1 change with approval');
});

test('accounts group by provider with titles, teammates and last use', () => {
  const second = conn({ id: 'b', email: null, accountLabel: 'octo', teammates: [{ agentId: 'x', name: 'Ana' }, { agentId: 'y', name: 'Bo' }, { agentId: 'z', name: 'Cy' }] });
  const mcp = conn({ id: 'm', provider: 'mcp_ab12cd34', name: 'Docs', mcp: { serverId: 's', url: 'https://d' } });
  const groups = groupAccounts([mcp, conn(), second], catalogue);
  assert.deepEqual(groups.map(g => [g.provider, g.accounts.length, g.canAdd, g.mcp]), [['gmail', 2, true, false], ['mcp_ab12cd34', 1, false, true]]);
  assert.equal(accountTitle(second), 'octo');
  assert.equal(teammatesLine(conn()), 'No teammate uses this yet');
  assert.equal(teammatesLine(second), 'Used by Ana, Bo and 1 more');
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.equal(lastUsedLine(null, now), 'Not used yet');
  assert.equal(lastUsedLine('2026-09-30T09:00:00Z', now), 'Used 3 h ago');
  assert.equal(lastUsedLine('2026-09-28T12:00:00Z', now), 'Used 2 days ago');
});

test('grants: reads are one choice, each write its own; connected is not granted', () => {
  const ops = operationsFor('gmail', catalogue);
  assert.deepEqual(ops, { reads: ['gmail_search', 'gmail_read'], writes: ['gmail_send'] });
  assert.equal(grantState(undefined, ops), 'none');
  assert.equal(GRANT_WORDS.none, 'Connected · not allowed for this teammate');
  const reads = toggleOperation([], ops, 'reads', true);
  assert.deepEqual(reads, ['gmail_read', 'gmail_search']);
  assert.equal(readsOn(reads, ops), true);
  const withSend = toggleOperation(reads, ops, 'gmail_send', true);
  assert.deepEqual(withSend, ['gmail_read', 'gmail_search', 'gmail_send']);
  const grant = { id: 'g', agentId: 'a', connectionId: id, operations: withSend, revision: 1, revokedAt: null };
  assert.equal(grantState(grant, ops), 'some');
  assert.equal(grantState({ ...grant, revokedAt: 'x' }, ops), 'none');
  assert.deepEqual(toggleOperation(['gmail_send', 'unknown_op'], ops, 'gmail_send', false), [], 'unknown operations are dropped');
  assert.equal(toolLabel('github_create_issue', 'github'), 'Create issue');
  assert.equal(toolLabel('mcp_ab12cd34__search_docs'), 'Search docs');
});

test('MCP: only readOnlyHint tools are markable; changed lists need review', () => {
  const server = parseMcpServer({ connectionId: id, url: 'https://d', status: 'tools_changed', toolRevision: 'a',
    tools: [{ tool: 'mcp_x__a', kind: 'read', readOnlyHint: true }, { tool: 'mcp_x__b', kind: 'read', readOnlyHint: false }],
    pending: { revision: 'b'.repeat(64), added: ['mcp_x__c'], removed: ['mcp_x__b'], changed: [], tools: [] } }) as McpServer;
  assert.deepEqual(markableReads(server).map(t => t.tool), ['mcp_x__a']);
  assert.equal(needsReview(server), true);
  assert.equal(reviewSummary(server), 'This server’s tools changed (1 added, 1 removed). Teammates can’t use it until you review.');
  assert.deepEqual(operationsFor('mcp_x', catalogue, server).reads, ['mcp_x__a', 'mcp_x__b']);
  assert.equal(mcpUrlProblem('http://x.test'), 'Use an https:// address.');
  assert.equal(mcpUrlProblem('https://x.test:8443/mcp'), 'Only the standard HTTPS port (443) is supported.');
  assert.equal(mcpUrlProblem('https://x.test/mcp'), null);
});

test('client uses the exact contract paths, methods and bodies', async () => {
  const seen: { method: string; url: string; body: unknown }[] = [];
  const answers: Record<string, unknown> = {
    [`GET agents/v2/connections`]: { connections: [{ id, provider: 'gmail' }] },
    [`POST agents/v2/connections/gmail/start`]: { flowId: id, url: 'https://accounts.example/' },
    [`PUT agents/v2/agents/${id}/grants/${id}`]: { grant: { id: 'g', connectionId: id, operations: ['gmail_read'] } },
    [`DELETE agents/v2/agents/${id}/grants/${id}`]: { ok: true },
    [`POST agents/v2/mcp/servers`]: { connection: { id, provider: 'mcp_ab12cd34' }, server: { connectionId: id }, signIn: null },
    [`POST agents/v2/mcp/servers/${id}/approve`]: { server: { connectionId: id } },
    [`PUT agents/v2/mcp/servers/${id}/reads`]: { server: { connectionId: id } },
  };
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.test/api/', '');
    seen.push({ method: init.method!, url: path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const data = answers[`${init.method} ${path}`];
    return new Response(JSON.stringify(data ?? { ok: false, code: 'nope', error: 'Nope' }), { status: data ? 200 : 409, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  const api = createConnectionsApi('https://api.test', () => 'token', fetcher);
  assert.equal((await api.list())[0]!.status, 'ok');
  assert.deepEqual(await api.start('gmail', 'vibyra://integrations/connected'), { flowId: id, url: 'https://accounts.example/' });
  await api.putGrant(id, id, ['gmail_read']);
  await api.revokeGrant(id, id);
  assert.equal((await api.addMcp('https://docs.example/mcp')).signIn, null);
  await api.mcpApprove(id, 'b'.repeat(64));
  await api.mcpReads(id, ['mcp_x__a']);
  assert.deepEqual(seen.map(s => [s.method, s.url, s.body]), [
    ['GET', 'agents/v2/connections', undefined],
    ['POST', 'agents/v2/connections/gmail/start', { returnUrl: 'vibyra://integrations/connected' }],
    ['PUT', `agents/v2/agents/${id}/grants/${id}`, { operations: ['gmail_read'] }],
    ['DELETE', `agents/v2/agents/${id}/grants/${id}`, undefined],
    ['POST', 'agents/v2/mcp/servers', { url: 'https://docs.example/mcp' }],
    ['POST', `agents/v2/mcp/servers/${id}/approve`, { revision: 'b'.repeat(64) }],
    ['PUT', `agents/v2/mcp/servers/${id}/reads`, { tools: ['mcp_x__a'] }],
  ]);
  await assert.rejects(api.remove(id), (e: any) => e.code === 'nope' && e.status === 409);
});
