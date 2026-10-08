import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionsClient } from '../src/components/teammates/connectionsClient.ts';
import { STATUS_PILL, grantState, operationsFor, toggleOperation, unavailableReason } from '../../mobile/src/agents/v2/hubModel.ts';
import { parseCatalogue } from '../../mobile/src/agents/v2/connectionsModel.ts';

const id = '123e4567-e89b-42d3-a456-000000000001';
const recorder = answers => {
  const calls = [];
  const api = async (path, body, method) => { calls.push([method ?? (body ? 'POST' : 'GET'), path, body]); const a = answers[path]; if (a instanceof Error) throw a; return a ?? {}; };
  return { calls, client: connectionsClient(api) };
};

test('Mac hub client uses the bridge paths and methods the Rust allowlist permits', async () => {
  const { calls, client } = recorder({
    'agents/v2/connections': { connections: [{ id, provider: 'gmail', status: 'insufficient_scope' }] },
    'agents/v2/catalogue': { providers: [{ provider: 'slack', readiness: 'unavailable', reason: 'flag_off' }] },
    'agents/v2/connections/gmail/start': { flowId: id, url: 'https://accounts.example/' },
    [`agents/v2/agents/${id}/grants/${id}`]: { grant: { connectionId: id, operations: ['gmail_read'] } },
    [`agents/v2/mcp/servers/${id}/reads`]: { server: { connectionId: id, tools: [] } },
    'agents/v2/mcp/servers': { connection: { id, provider: 'mcp_ab12cd34' }, server: { connectionId: id }, signIn: { flowId: id, url: 'https://idp.example/' } },
  });
  assert.equal((await client.list())[0].status, 'insufficient_scope');
  assert.equal(STATUS_PILL.insufficient_scope.label, 'Needs more access');
  assert.equal(unavailableReason((await client.catalogue())[0]), 'Not switched on for your account yet.');
  assert.equal((await client.start('gmail')).url, 'https://accounts.example/');
  await client.putGrant(id, id, ['gmail_read']);
  await client.revokeGrant(id, id);
  await client.remove(id);
  await client.mcpReads(id, ['mcp_x__a']);
  assert.equal((await client.addMcp('https://docs.example/mcp')).signIn.url, 'https://idp.example/');
  assert.deepEqual(calls, [
    ['GET', 'agents/v2/connections', undefined],
    ['GET', 'agents/v2/catalogue', undefined],
    ['POST', 'agents/v2/connections/gmail/start', {}],
    ['PUT', `agents/v2/agents/${id}/grants/${id}`, { operations: ['gmail_read'] }],
    ['DELETE', `agents/v2/agents/${id}/grants/${id}`, undefined],
    ['DELETE', `agents/v2/connections/${id}`, undefined],
    ['PUT', `agents/v2/mcp/servers/${id}/reads`, { tools: ['mcp_x__a'] }],
    ['POST', 'agents/v2/mcp/servers', { url: 'https://docs.example/mcp' }],
  ]);
});

test('a malformed grant answer is refused rather than shown as saved', async () => {
  const { client } = recorder({ [`agents/v2/agents/${id}/grants/${id}`]: { grant: null } });
  await assert.rejects(client.putGrant(id, id, ['x']), /invalid grant/);
});

test('connected is not granted until an operation is saved', () => {
  const catalogue = parseCatalogue([{ provider: 'github', readiness: 'ready', tools: [{ tool: 'github_list_issues', kind: 'read' }, { tool: 'github_create_issue', kind: 'write' }] }]);
  const ops = operationsFor('github', catalogue);
  assert.equal(grantState(undefined, ops), 'none');
  const next = toggleOperation([], ops, 'github_create_issue', true);
  assert.deepEqual(next, ['github_create_issue']);
  assert.equal(grantState({ id: 'g', agentId: id, connectionId: id, operations: next, revision: 1, revokedAt: null }, ops), 'some');
});
