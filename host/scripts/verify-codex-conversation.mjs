// Real, bounded provider probe. Uses an ephemeral /tmp workspace and never the repository.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const workspace = await mkdtemp(join(tmpdir(), 'vibyra-codex-conversation-'));
const mode = process.argv[2] ?? 'stream';
assert.ok(['stream', 'question', 'dynamic-question', 'approval-decline', 'approval-accept', 'interrupt'].includes(mode));
const child = spawn('codex', ['app-server', '--stdio'], { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'] });
const events = [];
const pending = new Map();
let sequence = 0;
let completed;
let threadId;
let turnId;
let requestObserved = false;
let interrupted = false;
const send = value => child.stdin.write(`${JSON.stringify(value)}\n`);
const request = (method, params) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
  pending.set(id, { resolve, reject, timer });
  send({ id, method, params });
});
createInterface({ input: child.stdout }).on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method) {
    events.push({ method: message.method, itemType: message.params?.item?.type,
      status: message.params?.turn?.status, itemId: message.params?.item?.id,
      callId: message.params?.callId, requestId: message.params?.requestId,
      tool: message.params?.tool, rpcId: message.id });
    if (message.method === 'turn/started') turnId = message.params.turn.id;
    if (message.method === 'turn/completed') completed?.(message.params.turn);
    if (mode === 'interrupt' && message.method === 'item/started'
      && message.params.item.type === 'commandExecution' && !interrupted) {
      interrupted = true;
      void request('turn/interrupt', { threadId, turnId }).catch(() => {});
    }
    if (message.id !== undefined) {
      if (mode === 'dynamic-question' && message.method === 'item/tool/call' && message.params.tool === 'vibyra_ask_user') {
        requestObserved = true;
        send({ id: message.id, result: { success: true,
          contentItems: [{ type: 'inputText', text: JSON.stringify({ answers: { style: { answers: ['Calm and minimal'] } } }) }] } });
      } else if (mode === 'question' && message.method === 'item/tool/requestUserInput') {
        requestObserved = true;
        send({ id: message.id, result: { answers: Object.fromEntries(message.params.questions.map(q =>
          [q.id, { answers: [q.options?.[0]?.label ?? 'Calm and minimal'] }])) } });
      } else if (mode.startsWith('approval-') && message.method === 'item/commandExecution/requestApproval') {
        requestObserved = true;
        const command = message.params.command ?? '';
        const expected = command === 'touch vibyra-probe-marker'
          || /^\/bin\/(?:zsh|bash|sh) -lc ['"]touch vibyra-probe-marker['"]$/.test(command);
        send({ id: message.id, result: { decision: mode === 'approval-accept' && expected ? 'accept' : 'decline' } });
      } else send({ id: message.id, error: { code: -32601, message: 'Probe does not grant this action' } });
    }
  } else {
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  }
});
child.stderr.resume();
try {
  const initialized = await request('initialize', { clientInfo: { name: 'vibyra_conversation_probe', version: '1.0' },
    capabilities: { experimentalApi: true } });
  send({ method: 'initialized', params: {} });
  const dynamicTools = mode === 'dynamic-question' ? [{ type: 'function', name: 'vibyra_ask_user',
    description: 'Ask the user a question and wait for their answer. Not for execution approval.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'], additionalProperties: false } }] : undefined;
  const started = await request('thread/start', { cwd: workspace, ephemeral: true,
    approvalsReviewer: 'user', approvalPolicy: 'on-request', sandbox: 'workspace-write', dynamicTools });
  threadId = started.thread.id;
  const finished = new Promise((resolve, reject) => {
    completed = resolve;
    setTimeout(() => reject(new Error('Turn did not finish within 90 seconds')), 90000).unref();
  });
  const prompts = {
    stream: 'Reply with exactly: Vibyra conversation streaming works. Do not use tools, inspect files, or run commands.',
    question: 'Use the request_user_input tool now to ask which style I prefer: Calm and minimal or Bold and expressive. Wait for my tool response, then reply with the selected answer. Do not ask in ordinary text. Do not use other tools.',
    'dynamic-question': 'Use vibyra_ask_user now to ask which style I prefer: Calm and minimal or Bold and expressive. Wait for the tool response, then reply with the selected answer. Do not ask in ordinary text. Do not use other tools.',
    'approval-decline': 'Test the approval interface. Call exec_command with cmd "touch vibyra-probe-marker", sandbox_permissions require_escalated, and justification "Allow this isolated test marker?". If declined, stop without trying another way. Do not write any other files.',
    'approval-accept': 'Test the approval interface. Call exec_command with cmd "touch vibyra-probe-marker", sandbox_permissions require_escalated, and justification "Allow this isolated test marker?". If declined, stop without trying another way. Do not write any other files.',
    interrupt: 'Run sleep 30 using exec_command now, then say finished. Do not perform other work.',
  };
  await request('turn/start', { threadId, input: [{ type: 'text', text: prompts[mode] }] });
  const result = await finished;
  if (mode === 'interrupt') assert.equal(result.status, 'interrupted');
  else assert.equal(result.status, 'completed');
  if (mode === 'stream') {
    assert.ok(events.some(event => event.method === 'item/agentMessage/delta'), 'Real assistant tokens streamed');
    assert.ok(events.some(event => event.method === 'item/completed' && event.itemType === 'agentMessage'));
  }
  const markerExists = await access(join(workspace, 'vibyra-probe-marker')).then(() => true, () => false);
  const report = { mode, version: initialized.userAgent, workspace, status: result.status, requestObserved, markerExists, events };
  await writeFile(join(workspace, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, events: undefined,
    eventMethods: [...new Set(events.map(event => event.method))] }, null, 2));
  if (mode.includes('question') || mode.startsWith('approval-')) assert.ok(requestObserved, 'Expected real provider request was observed');
  if (mode === 'approval-decline') assert.equal(markerExists, false, 'Declined action must not execute');
  if (mode === 'approval-accept') assert.equal(markerExists, true, 'Accepted isolated action must execute');
} finally {
  if (threadId && turnId) await request('turn/interrupt', { threadId, turnId }).catch(() => {});
  for (const entry of pending.values()) clearTimeout(entry.timer);
  child.kill('SIGTERM');
}
