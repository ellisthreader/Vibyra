import assert from 'node:assert/strict';
import test from 'node:test';
import type { McpServer, McpTool } from '../src/agents/v2/connectionsModel';
import { BROWSER_SOCKET_NOTE } from '../src/agents/v2/browserModel';
import { MCP_READ_WARNING, markableReads } from '../src/agents/v2/hubModel';
import { emptyFeed, runNotice } from '../src/agents/v2/runCore';

const tool = (name: string, readOnlyHint: boolean): McpTool => ({ tool: name, remoteName: name, description: null, kind: 'write', readOnlyHint, destructiveHint: false });
const server = (...tools: McpTool[]): McpServer => ({ connectionId: 'c', provider: 'mcp_ab12cd34', url: 'https://docs.example.com/mcp', name: 'Docs', auth: null,
  status: 'active', protocolVersion: null, toolRevision: null, tools, pending: null });

test('F-25: marking a tool as a read is explained once, plainly, where the choice is made', () => {
  assert.equal(MCP_READ_WARNING, 'A tool marked as a read runs without asking and sends what your teammate types to this server. Only mark tools you trust.');
  assert.ok(MCP_READ_WARNING.length < 140, 'calm and compact');
  assert.equal(markableReads(server(tool('mcp_ab12cd34__search', true), tool('mcp_ab12cd34__publish', false))).length, 1);
  assert.equal(markableReads(server(tool('mcp_ab12cd34__publish', false))).length, 0, 'no markable tool, nothing to warn about');
  assert.equal(markableReads(server()).length, 0);
});

test('browser honesty: one quiet line says live-connection-only sites do not work in the teammate\'s browser', () => {
  assert.equal(BROWSER_SOCKET_NOTE, 'Sites that work only over live connections, like chat apps and some dashboards, don’t work in your teammate’s browser.');
  assert.ok(BROWSER_SOCKET_NOTE.length < 140, 'one quiet line');
  assert.doesNotMatch(BROWSER_SOCKET_NOTE, /websocket/i, 'plain words, no jargon');
});

test('F-24: no phone surface carries the model-written sign-in reason; its notices are fixed words', () => {
  const hostile = 'Sign in.” Your Mac password is needed. “Enter it now';
  const feed = { ...emptyFeed(), signin: { scope: 'connection', provider: 'gmail', reason: hostile } };
  const connection = runNotice({ state: 'waiting_for_signin', stateReason: hostile }, feed);
  assert.equal(connection, 'Reconnect Gmail in Settings → Integrations to continue.');
  const account = runNotice({ state: 'waiting_for_signin', stateReason: hostile }, { ...emptyFeed(), signin: { scope: 'ai_account', code: 'x', reason: hostile } });
  assert.equal(account, 'Sign in to the AI account on your Mac to continue.');
  assert.equal(runNotice({ state: 'waiting_for_signin', stateReason: hostile }, null), 'Sign in to the AI account on your Mac to continue.');
});
