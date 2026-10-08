import assert from 'node:assert/strict';
import test from 'node:test';
import type { HubConnection } from '../src/agents/v2/connectionsModel';
import { accountsGranted, approvalAccount, connectionSuffix, grantedAccountCount } from '../src/agents/v2/approvalAccount';
import { actionTool, type RunAction } from '../src/agents/v2/runCore';

const conn = (id: string, provider: string, agents: string[], extra: Partial<HubConnection> = {}): HubConnection => ({
  id, provider, account: `${id.slice(-4)}@example.com`, health: 'healthy', generation: 1, source: 'connection', createdAt: '', status: 'ok',
  name: provider, accountLabel: null, email: null, scopes: [], scopesSource: 'requested', lastUsedAt: null, reconnect: null, mcp: null,
  teammates: agents.map(agentId => ({ agentId, name: agentId, operations: ['x'], revision: 1 })), ...extra });
const A = '123e4567-e89b-42d3-a456-00000000a1b2', B = '123e4567-e89b-42d3-a456-00000000c3d4';

test('F-07: one granted account shows only its label, several add a short connection id', () => {
  assert.equal(approvalAccount('team@example.com', A, 1), 'team@example.com');
  assert.equal(approvalAccount('team@example.com', A, 0), 'team@example.com');
  assert.equal(approvalAccount('team@example.com', A, 2), 'team@example.com · a1b2');
  assert.equal(approvalAccount('team@example.com', B, 3), 'team@example.com · c3d4');
  assert.notEqual(approvalAccount('same@example.com', A, 2), approvalAccount('same@example.com', B, 2), 'two accounts with one label stay tellable apart');
});

test('F-07: a missing label still names the account by its id when several are granted, and never invents one otherwise', () => {
  assert.equal(approvalAccount(null, A, 2), 'Account · a1b2');
  assert.equal(approvalAccount('  ', A, 2), 'Account · a1b2');
  assert.equal(approvalAccount(null, A, 1), null);
  assert.equal(approvalAccount(undefined, undefined, 2), null);
  assert.equal(approvalAccount('team@example.com', null, 2), 'team@example.com', 'no id to show');
});

test('F-07: the suffix is four lowercase letters or digits from the end of the id, whatever the id holds', () => {
  assert.equal(connectionSuffix('123E4567-E89B-42D3-A456-00000000A1B2'), 'a1b2');
  assert.equal(connectionSuffix('x<b>y</b>-12'), 'yb12', 'markup and dashes never reach the card');
  assert.equal(connectionSuffix('ab'), 'ab');
  assert.equal(connectionSuffix(null), '');
});

test('F-07: only this teammate\'s grants on this provider count', () => {
  const list = [conn(A, 'gmail', ['review']), conn(B, 'gmail', ['review', 'site']), conn('c-other-gmail-9999', 'gmail', ['site']),
    conn('c-github-0000-aaaa', 'github', ['review']), conn('c-gmail-none-0000', 'gmail', [])];
  assert.equal(grantedAccountCount(list, 'review', 'gmail'), 2);
  assert.equal(grantedAccountCount(list, 'site', 'gmail'), 2);
  assert.equal(grantedAccountCount(list, 'review', 'github'), 1);
  assert.equal(grantedAccountCount(list, 'nobody', 'gmail'), 0);
});

test('F-07: while the account list is loading no id is added, and when it failed the id is always shown', () => {
  assert.equal(accountsGranted(null, 'review', 'gmail'), 1);
  assert.equal(accountsGranted('failed', 'review', 'gmail'), 2);
  assert.equal(accountsGranted([conn(A, 'gmail', ['review'])], 'review', 'gmail'), 1);
  assert.equal(approvalAccount('team@example.com', A, accountsGranted('failed', 'review', 'gmail')), 'team@example.com · a1b2');
});

test('F-07: the run action keeps the connection it names, for the approval card', () => {
  const action: RunAction = { id: 'act', callId: 'c', tool: 'gmail_send', kind: 'write', connectionId: A, provider: 'gmail', account: 'team@example.com',
    state: 'pending_approval', summary: null, arguments: { to: 'x@example.com' }, fingerprint: 'f'.repeat(64), expiresAt: new Date(Date.now() + 60000).toISOString() };
  assert.equal(actionTool(action).connectionId, A);
  assert.equal(actionTool({ ...action, connectionId: null }).connectionId, null);
});
