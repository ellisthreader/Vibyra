import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const provider = process.argv[2] ?? 'claude';
const program = process.argv[3] ?? provider;
const root = await mkdtemp(join(tmpdir(), `vibyra-${provider}-bridge-`));
const source = (await Promise.all(['wire', 'claude', 'gemini', 'main'].map(name => readFile(new URL(`../provider-bridge/${name}.cjs`, import.meta.url), 'utf8')))).join('\n');
const env = { ...process.env };
for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDECODE', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) delete env[key];
const child = spawn(process.execPath, ['-e', source, provider, program], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', sequence = 0; const pending = new Map(); const events = [];
child.stderr.on('data', data => process.stderr.write(data));
child.stdout.on('data', data => {
 buffer += data.toString(); let end;
 while ((end = buffer.indexOf('\n')) >= 0) {
  const value = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
  if (value.method) { events.push(value); continue; }
  const request = pending.get(value.id); pending.delete(value.id);
  if (value.error) request?.reject(new Error(value.error.message)); else request?.resolve(value.result);
 }
});
const request = (method, params = {}) => new Promise((resolve, reject) => {
 const id = String(++sequence); const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 30000);
 pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
 child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
});
try {
 await request('initialize');
 const session = await request('thread/start', { cwd: root, approvalPolicy: 'on-request', config: { model_reasoning_effort: provider === 'claude' ? 'low' : 'none' } });
 const catalogue = await request('model/list'); assert.ok(catalogue.data.length);
 console.log(`${provider}: initialized ${catalogue.data.length} account models; selected ${session.model}`);
 await writeFile(join(root, 'reference.txt'), 'The verification word is cobalt.\n');
 if (process.env.VIBYRA_PROVIDER_LIVE === '1') {
  await request('turn/start', { model: session.model, effort: session.reasoningEffort, input: [{ type: 'text', text: 'Read reference.txt, then say its verification word. Do not change files, run shell commands, or use any other tool.' }] });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !events.some(event => event.method === 'turn/completed')) await new Promise(resolve => setTimeout(resolve, 100));
  const done = events.find(event => event.method === 'turn/completed'); assert.equal(done?.params.turn.status, 'completed', JSON.stringify(done));
  assert.ok(JSON.stringify(events).includes('cobalt')); console.log(`${provider}: real reply and observed tool events passed`);
 }
 console.log('PASS provider handshake and model catalogue');
} finally { child.stdin.end(); child.kill(); }
