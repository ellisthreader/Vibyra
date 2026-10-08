// A tiny stdio MCP server for tests. It speaks both protocol eras:
//  - legacy: `initialize` handshake (2025-11-25), `tools/list`, `tools/call`;
//  - modern (2026-07-28): `server/discover`, then every request carries `_meta`.
// FIXTURE is a comma list of behaviours: modern-only, legacy-only, silent-discover,
// slow-start=ms, noise, no-pagination, leak-secret, die-on-start.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const flags = new Map((process.env.FIXTURE || '').split(',').filter(Boolean).map((f) => f.split('=')));
const has = (name) => flags.has(name);
const MODERN = '2026-07-28';
const tools = [
  { name: 'echo', description: 'Echo text back.', inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    annotations: { readOnlyHint: true } },
  { name: 'write_note', description: 'Pretend to write.', inputSchema: { type: 'object', properties: {} } },
  { name: 'env_names', description: 'Names of the environment variables.', inputSchema: { type: 'object', properties: {} } },
  { name: 'pid', description: 'Process id.', inputSchema: { type: 'object', properties: {} } },
  { name: 'grandchild', description: 'Start a long sleep and return its pid.', inputSchema: { type: 'object', properties: {} } },
  { name: 'crash', description: 'Exit mid-call.', inputSchema: { type: 'object', properties: {} } },
  { name: 'hang', description: 'Never answer.', inputSchema: { type: 'object', properties: {} } },
  { name: 'big', description: 'Return a lot of text.', inputSchema: { type: 'object', properties: { bytes: { type: 'integer' } } } },
  { name: 'fail', description: 'Tool-level error.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ask', description: 'Wants input back.', inputSchema: { type: 'object', properties: {} } },
];
if (has('leak-secret')) console.error('starting with ' + (process.env.FIXTURE_SECRET || ''));
if (has('die-on-start')) { console.error('boom'); process.exit(3); }
if (has('noise')) console.log('Welcome to the noisy server (not JSON)');

const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => send({ jsonrpc: '2.0', id, error: { code, message, data } });
const text = (value, extra = {}) => ({ content: [{ type: 'text', text: value }], ...extra });
let initialized = false;
let children = [];

function call(id, name, args) {
  switch (name) {
    case 'echo': return reply(id, text(String(args.text ?? '')));
    case 'write_note': return reply(id, text('written'));
    case 'env_names': return reply(id, text(Object.keys(process.env).sort().join(',')));
    case 'pid': return reply(id, text(String(process.pid)));
    case 'grandchild': {
      const child = spawn('sleep', ['300'], { stdio: 'ignore' });
      children.push(child);
      return reply(id, text(String(child.pid)));
    }
    case 'crash': return process.exit(7);
    case 'hang': return undefined;
    case 'big': return reply(id, text('x'.repeat(Number(args.bytes ?? 1000))));
    case 'fail': return reply(id, text('it went wrong', { isError: true }));
    case 'ask': return reply(id, { resultType: 'input_required', inputRequests: {} });
    default: return fail(id, -32602, 'Unknown tool: ' + name);
  }
}

function handle(message) {
  const { id, method, params = {} } = message;
  if (method === 'notifications/initialized') { initialized = true; return; }
  if (method === 'notifications/cancelled') return;
  if (id === undefined) return;
  const meta = params._meta || {};
  const version = meta['io.modelcontextprotocol/protocolVersion'];
  if (method === 'server/discover') {
    if (has('exit-on-discover')) return process.exit(1);
    if (has('legacy-only')) return fail(id, -32601, 'Method not found');
    if (has('silent-discover')) return;
    if (version !== MODERN) return fail(id, -32022, 'Unsupported protocol version', { supported: [MODERN], requested: version });
    return reply(id, { resultType: 'complete', supportedVersions: [MODERN], capabilities: { tools: {} },
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'fixture', version: '1' } } });
  }
  if (method === 'initialize') {
    if (has('modern-only')) return fail(id, -32601, 'initialize is not supported; use ' + MODERN);
    return reply(id, { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } });
  }
  const modernCall = version === MODERN;
  if (has('modern-only') && !modernCall) return fail(id, -32602, 'Missing _meta');
  if (!has('modern-only') && !modernCall && !initialized) return fail(id, -32600, 'Not initialized');
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') {
    const paged = !has('no-pagination');
    const start = paged && params.cursor === 'p2' ? 5 : 0;
    const slice = paged ? tools.slice(start, start === 0 ? 5 : tools.length) : tools;
    return reply(id, { tools: slice, ...(paged && start === 0 ? { nextCursor: 'p2' } : {}) });
  }
  if (method === 'tools/call') return call(id, params.name, params.arguments || {});
  return fail(id, -32601, 'Method not found: ' + method);
}

const start = () => createInterface({ input: process.stdin }).on('line', (line) => {
  try { handle(JSON.parse(line)); } catch { /* ignore */ }
}).on('close', () => { children.forEach((c) => c.kill()); process.exit(0); });
const delay = Number(flags.get('slow-start') || 0);
if (delay) setTimeout(start, delay); else start();
