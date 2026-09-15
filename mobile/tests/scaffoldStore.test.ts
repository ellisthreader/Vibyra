import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScaffoldEvent } from '../src/state/scaffoldActions';
import type { ScaffoldEvent } from '../src/scaffold/api';
import { delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

/** A harness whose computer answers `host.state` with the given capabilities. */
function connected(capabilities?: Record<string, boolean>) {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'host.state') return false;
    h.reply(message, { ...structuredClone(hostState), capabilities });
    return true;
  });
  return h;
}

test('a computer that cannot build projects offers nothing, and says why', async () => {
  const h = connected({ vibesToolsV1: true }); await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.scaffoldAvailable, false);
  await assert.rejects(h.store.actions.scaffold!.preflight(['node']), /Update Vibyra Host/);
  assert.equal(h.sent.some(item => item.payload?.method === 'scaffold.preflight'), false, 'nothing is asked of it');
  h.store.dispose();
});

test('preflight, start, cancel and status go to the computer, and a finished build refreshes the list', async () => {
  const h = connected({ scaffoldV1: true }); await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.scaffoldAvailable, true);
  const scaffold = h.store.actions.scaffold!;
  h.handle(message => {
    const method = message.payload?.method;
    if (method === 'host.state') { h.reply(message, { ...structuredClone(hostState), capabilities: { scaffoldV1: true } }); return true; }
    if (method === 'scaffold.preflight') { h.reply(message, { tools: { node: true, flutter: false }, home: '/home/ellis', parent: '/home/ellis/Code' }); return true; }
    if (method === 'scaffold.adopt') { h.reply(message, { project: { id: 'p2', name: 'site', path: '/home/ellis/Code/site' } }); return true; }
    return false;
  });
  const answer = await scaffold.preflight(['node', 'flutter']);
  assert.deepEqual(answer, { tools: { node: true, flutter: false }, home: '/home/ellis', parent: '/home/ellis/Code' });
  const plan = { dir: '/home/ellis/Code/site', createDir: true, seeds: [], steps: [], gitInit: true };
  await scaffold.start('run-1', plan);
  const started = h.sent.find(item => item.payload?.method === 'scaffold.start').payload.params;
  assert.deepEqual(started, { runId: 'run-1', plan });
  await scaffold.cancel('run-1');
  assert.equal(h.sent.at(-1).payload.params.runId, 'run-1');
  const seen: ScaffoldEvent[] = [];
  const stop = scaffold.follow(event => seen.push(event));
  h.event('scaffold.step', { runId: 'run-1', index: 0, total: 2, label: 'Creating the app' });
  h.event('scaffold.output', { runId: 'run-1', lines: ['one', 2, 'two'] });
  h.event('terminal.output', { sessionId: 'one', output: 'x', offset: 1, generation: 'g1' });
  h.event('scaffold.done', { runId: 'run-1', ok: true, message: null, stalled: false, project: { id: 'p2', name: 'site', path: '/home/ellis/Code/site' } });
  assert.deepEqual(seen, [
    { type: 'step', runId: 'run-1', index: 0, total: 2, label: 'Creating the app' },
    { type: 'output', runId: 'run-1', lines: ['one', 'two'] },
    { type: 'done', runId: 'run-1', ok: true, message: null, stalled: false, project: { id: 'p2', name: 'site', path: '/home/ellis/Code/site' } },
  ]);
  stop();
  h.event('scaffold.step', { runId: 'run-1', index: 1, total: 2, label: 'Installing' });
  assert.equal(seen.length, 3, 'a stopped listener hears nothing more');
  const states = h.sent.filter(item => item.payload?.method === 'host.state').length;
  const project = await scaffold.adopt('/home/ellis/Code/site');
  assert.equal(project.name, 'site');
  await delay();
  assert.equal(h.sent.filter(item => item.payload?.method === 'host.state').length, states + 1, 'adopting reads the list back');
  h.store.dispose();
});

test('events from the computer are read strictly', () => {
  assert.equal(parseScaffoldEvent('scaffold.nope', { runId: 'r' }), null);
  assert.deepEqual(parseScaffoldEvent('scaffold.done', { runId: 'r', ok: 'yes', message: 7, stalled: 1, project: 'x' }),
    { type: 'done', runId: 'r', ok: false, message: null, stalled: false, project: null });
  assert.deepEqual(parseScaffoldEvent('scaffold.output', { runId: 'r' }), { type: 'output', runId: 'r', lines: [] });
});
