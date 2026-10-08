// A tiny Agent Client Protocol agent for testing the Vibyra provider bridge. Speaks JSON-RPC over stdio.
// FIXTURE_MODE (comma list): nomodels, noise, v2, alwaysonly. FIXTURE_LOG: a file receiving one JSON line per client message.
const fs = require('node:fs');
const modes = (process.env.FIXTURE_MODE || '').split(',');
const log = value => process.env.FIXTURE_LOG && fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(value) + '\n');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const update = update => send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's1', update } });
const chunk = text => update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
const waiting = new Map();
log({ argv: process.argv.slice(2) });
if (modes.includes('noise')) process.stdout.write('starting up (not JSON)\n');
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => {
  buffer += data; let end;
  while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (line.trim()) handle(JSON.parse(line)); }
});
function handle(m) {
  log(m);
  if (!m.method) { waiting.get(m.id)?.(m.result); waiting.delete(m.id); return; }
  if (m.method === 'session/cancel') return;
  const reply = result => send({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') return reply({ protocolVersion: modes.includes('v2') ? 2 : 1, agentCapabilities: {}, authMethods: [] });
  if (m.method === 'session/new') {
    if (modes.includes('noise')) process.stdout.write('another stray line\n');
    return reply(modes.includes('nomodels') ? { sessionId: 's1' }
      : { sessionId: 's1', models: { availableModels: [{ modelId: 'm1', name: 'Model One' }, { modelId: 'm2', name: 'Model Two' }], currentModelId: 'm1' } });
  }
  if (m.method === 'session/set_model') return reply({});
  if (m.method !== 'session/prompt') return send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'no such method' } });
  const text = m.params.prompt.map(p => p.text ?? '').join(' ');
  if (!text.includes('edit')) { chunk('Hello from the fixture'); return reply({ stopReason: 'end_turn' }); }
  const options = modes.includes('alwaysonly')
    ? [{ optionId: 'a', kind: 'allow_always', name: 'Always' }, { optionId: 'r', kind: 'reject_always', name: 'Never' }]
    : [{ optionId: 'allow', kind: 'allow_once', name: 'Allow' }, { optionId: 'reject', kind: 'reject_once', name: 'Reject' }];
  update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Write notes.txt', kind: 'edit', status: 'pending', rawInput: { path: 'notes.txt' } });
  new Promise(resolve => { waiting.set(100, resolve); send({ jsonrpc: '2.0', id: 100, method: 'session/request_permission',
    params: { sessionId: 's1', toolCall: { toolCallId: 't1', title: 'Write notes.txt', kind: 'edit', rawInput: { path: 'notes.txt' } }, options } }); })
    .then(result => {
      const outcome = result?.outcome;
      const wrote = outcome?.outcome === 'selected' && outcome.optionId === 'allow';
      update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: wrote ? 'completed' : 'failed' });
      chunk(`outcome=${outcome?.outcome}:${outcome?.optionId ?? ''}`);
      reply({ stopReason: 'end_turn' });
    });
}
