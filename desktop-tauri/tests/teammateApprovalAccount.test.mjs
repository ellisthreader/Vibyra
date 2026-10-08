import test from 'node:test';
import assert from 'node:assert/strict';
import { runTurn } from '../src/components/teammates/runsV2.ts';
import { accountsGranted, approvalAccount } from '../../mobile/src/agents/v2/approvalAccount.ts';
import { BROWSER_SOCKET_NOTE } from '../../mobile/src/agents/v2/browserModel.ts';
import { MCP_READ_WARNING } from '../../mobile/src/agents/v2/hubModel.ts';

const A = '123e4567-e89b-42d3-a456-00000000a1b2', B = '123e4567-e89b-42d3-a456-00000000c3d4';
const action = (connectionId, account) => ({ id: 'act-1', callId: 'c', tool: 'gmail_send', kind: 'write', connectionId, provider: 'gmail', account,
  state: 'pending_approval', summary: null, arguments: { to: 'a@example.com' }, fingerprint: 'f'.repeat(64), expiresAt: new Date(Date.now() + 60000).toISOString(), receipt: null });
const run = actions => ({ id: 'run-1', agentId: 'agent-1', conversationId: 'chat-1', conversationSeq: 1, idempotencyKey: 'key-00000001', state: 'waiting_for_approval',
  stateReason: null, terminal: false, prompt: 'Email them', answer: null, runtime: { model: 'm' }, eventCursor: 0, actions, createdAt: '2026-09-30T12:00:00+00:00' });
const conn = (id, agents) => ({ id, provider: 'gmail', teammates: agents.map(agentId => ({ agentId })) });

test('F-07: the Mac approval card keeps the account label and connection id the server named', () => {
  const [tool] = runTurn(run([action(A, 'team@example.com')])).tools;
  assert.equal(tool.account, 'team@example.com');
  assert.equal(tool.connectionId, A);
  assert.equal(runTurn(run([action(null, 'x@example.com')])).tools[0].connectionId, undefined);
});

test('F-07: the Mac card line names the account, and adds the short id only when several are granted', () => {
  const [tool] = runTurn(run([action(A, 'team@example.com')])).tools;
  const line = list => approvalAccount(tool.account, tool.connectionId, accountsGranted(list, 'agent-1', 'gmail'));
  assert.equal(line([conn(A, ['agent-1'])]), 'team@example.com');
  assert.equal(line([conn(A, ['agent-1']), conn(B, ['agent-1'])]), 'team@example.com · a1b2');
  assert.equal(line([conn(A, ['agent-1']), conn(B, ['agent-2'])]), 'team@example.com', 'another teammate\'s grant does not count');
  assert.equal(line('failed'), 'team@example.com · a1b2', 'an unreadable list never hides the id');
  assert.equal(line(null), 'team@example.com', 'while it loads the label is already there');
});

test('F-25 and browser honesty: the Mac reads the same words as the phone', () => {
  assert.match(MCP_READ_WARNING, /^A tool marked as a read runs without asking and sends what your teammate types to this server\. Only mark tools you trust\.$/);
  assert.match(BROWSER_SOCKET_NOTE, /live connections, like chat apps and some dashboards, don’t work in your teammate’s browser\.$/);
});
