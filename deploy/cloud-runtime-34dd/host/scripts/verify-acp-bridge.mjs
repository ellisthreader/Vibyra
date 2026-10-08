// Drives the provider bridge (kind "acp") against fixtures/acp-agent.cjs: handshake, models, a turn, permission requests
// routed as `vibyra/tool/requestApproval`, stray stdout lines, a wrong protocol version and bad arguments. No network, no real CLI.
import { readFile, mkdtemp, writeFile, chmod, readFile as read } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const fixture = new URL('./fixtures/acp-agent.cjs', import.meta.url).pathname;
const source = (await Promise.all(['wire', 'tools', 'claude', 'gemini', 'main'].map(name => readFile(new URL(`../provider-bridge/${name}.cjs`, import.meta.url), 'utf8')))).join('\n');

async function bridge(mode = '', extra = {}, kind = 'acp', program = process.execPath) {
  const root = await mkdtemp(join(tmpdir(), 'vibyra-acp-'));
  const log = join(root, 'log.jsonl');
  const env = { ...process.env, FIXTURE_MODE: mode, FIXTURE_LOG: log, VIBYRA_ACP_NAME: 'Fixture agent', VIBYRA_ACP_ARGS: JSON.stringify([fixture, '--flag']), ...extra };
  // The "program" is node itself; its first argument is the fixture, as a custom agent's saved arguments would be.
  const child = spawn(process.execPath, ['-e', source, kind, program], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const events = [], pending = new Map(); let buffer = '', sequence = 0, stderr = '', exited;
  const done = new Promise(resolve => child.on('exit', code => resolve(exited = code)));
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', data => {
    buffer += data; let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const value = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (value.method) { events.push(value); continue; }
      const request = pending.get(value.id); pending.delete(value.id);
      if (value.error) request?.reject(new Error(value.error.message)); else request?.resolve(value.result);
    }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence); const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 10000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  const until = async (test, what) => { for (let i = 0; i < 400 && !test(); i++) await new Promise(r => setTimeout(r, 25)); assert.ok(test(), `timed out waiting for ${what}: ${JSON.stringify(events.slice(-4))}`); };
  const sent = async () => (await read(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(JSON.parse);
  return { request, events, until, sent, stderr: () => stderr, done, child, stop: () => { child.stdin.end(); child.kill(); } };
}
const text = events => events.filter(e => e.method === 'item/agentMessage/delta').map(e => e.params.delta).join('');
const finished = events => events.find(e => e.method === 'turn/completed')?.params.turn.status;

// 1. An agent that lists no models: one "default" choice, no set_model, a plain turn, stray stdout lines ignored.
{
  const b = await bridge('nomodels,noise');
  await b.request('initialize');
  const started = await b.request('thread/start', { approvalPolicy: 'on-request' });
  assert.equal(started.model, 'default');
  assert.deepEqual((await b.request('model/list')).data.map(m => [m.model, m.displayName]), [['default', 'Fixture agent']]);
  await b.request('turn/start', { model: 'default', input: [{ type: 'text', text: 'say hello' }] });
  await b.until(() => finished(b.events), 'the turn');
  assert.equal(finished(b.events), 'completed'); assert.equal(text(b.events), 'Hello from the fixture');
  const log = await b.sent();
  assert.ok(log[0].argv.includes('--flag'), 'the custom agent receives its saved arguments');
  assert.ok(!log.some(m => m.method === 'session/set_model'));
  await assert.rejects(b.request('account/rateLimits/read'), /Fixture agent does not expose/);
  b.stop();
}
// 2. An agent with models: the chosen one is set; an unadvertised one is refused.
{
  const b = await bridge();
  await b.request('initialize');
  const started = await b.request('thread/start', { model: 'm2', approvalPolicy: 'on-request' });
  assert.equal(started.model, 'm2');
  assert.ok((await b.sent()).some(m => m.method === 'session/set_model' && m.params.modelId === 'm2'));
  assert.deepEqual((await b.request('model/list')).data.map(m => m.model), ['m1', 'm2']);
  b.stop();
  const c = await bridge(); await c.request('initialize');
  await assert.rejects(c.request('thread/start', { model: 'nope', approvalPolicy: 'on-request' }), /did not advertise/);
  await assert.rejects(c.request('thread/start', { approvalPolicy: 'never' }), /require normal tool approvals/);
  c.stop();
}
// 3. Permission requests reach Vibyra's approval request; the answer picks allow_once or reject_once, never an "always".
for (const [decision, mode, outcome] of [['accept', '', 'selected:allow'], ['decline', '', 'selected:reject'], ['accept', 'alwaysonly', 'cancelled:']]) {
  const b = await bridge(mode);
  await b.request('initialize'); await b.request('thread/start', { approvalPolicy: 'on-request' });
  await b.request('turn/start', { model: 'm1', input: [{ type: 'text', text: 'please edit the notes' }] });
  await b.until(() => b.events.some(e => e.method === 'vibyra/tool/requestApproval'), 'the approval request');
  const ask = b.events.find(e => e.method === 'vibyra/tool/requestApproval');
  assert.equal(ask.id, 100); assert.equal(ask.params.tool, 'Write notes.txt'); assert.equal(ask.params.reason, 'Fixture agent wants to: Write notes.txt');
  assert.deepEqual(ask.params.availableDecisions, ['accept', 'decline']); assert.deepEqual(ask.params.input, { path: 'notes.txt' });
  assert.ok(!finished(b.events), 'the agent waits for the person');
  b.child.stdin.write(JSON.stringify({ id: ask.id, result: { decision } }) + '\n');
  await b.until(() => finished(b.events), 'the turn after the decision');
  assert.equal(text(b.events), `outcome=${outcome}`, `${decision}/${mode}`);
  b.stop();
}
// 4. A different protocol version, and malformed arguments, fail with a clear message.
{
  const b = await bridge('v2');
  await assert.rejects(b.request('initialize'), /does not speak Agent Client Protocol version 1/);
  b.stop();
  const bad = await bridge('', { VIBYRA_ACP_ARGS: '{"not":"a list"}' });
  assert.notEqual(await bad.done, 0); assert.match(bad.stderr(), /VIBYRA_ACP_ARGS/);
}
// 5. The built-in Gemini kind still runs through the same code: it passes --acp and names itself Gemini.
{
  const dir = await mkdtemp(join(tmpdir(), 'vibyra-fake-gemini-'));
  const program = join(dir, 'gemini');
  await writeFile(program, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`); await chmod(program, 0o755);
  const b = await bridge('', {}, 'gemini', program);
  await b.request('initialize'); await b.request('thread/start', { approvalPolicy: 'on-request' });
  await b.request('turn/start', { model: 'm1', input: [{ type: 'text', text: 'please edit it' }] });
  await b.until(() => b.events.some(e => e.method === 'vibyra/tool/requestApproval'), 'the approval request');
  assert.equal(b.events.find(e => e.method === 'vibyra/tool/requestApproval').params.reason, 'Gemini wants to: Write notes.txt');
  assert.deepEqual((await b.sent())[0].argv, ['--acp']);
  await assert.rejects(b.request('account/rateLimits/read'), /Gemini does not expose/);
  b.stop();
}
console.log('PASS ACP bridge: models, turn, approvals routed to Vibyra, never "always", stray output, version and arguments');
