import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostNoun, validHostPlatform } from '../src/ui/hostIdentity';
import { previewHostNoun } from '../src/preview/hostNoun';
import { previewProblem } from '../src/preview/previewProblem';

test('Preview copy names a Mac, a PC, or otherwise a computer', () => {
  assert.equal(hostNoun('macos'), 'Mac');
  assert.equal(hostNoun('windows'), 'PC');
  for (const platform of ['linux', 'freebsd', '', undefined, null]) assert.equal(hostNoun(platform), 'computer');
});

test('hostPlatform must be a short lowercase token', () => {
  for (const value of ['macos', 'windows', 'linux', 'freebsd']) assert.equal(validHostPlatform(value), true, value);
  for (const value of ['', 'MacOS', 'mac os', 'x'.repeat(33), 'win32', 7, null, undefined]) {
    assert.equal(validHostPlatform(value), false, String(value));
  }
});

test('the noun belongs to the host whose list named it', () => {
  const host = { id: 'h1', name: 'Studio', platform: 'macos' };
  assert.equal(previewHostNoun({ host, previewHost: { hostId: 'h1', platform: 'windows' } }), 'PC');
  assert.equal(previewHostNoun({ host, previewHost: { hostId: 'other', platform: 'windows' } }), 'computer');
  assert.equal(previewHostNoun({ host, previewHost: null }), 'computer');
});

test('problem copy keeps its Mac wording on a Mac', () => {
  assert.equal(previewProblem('connection', '', undefined, 'Mac').message,
    'Check that your Mac is connected and the website is still running, then try again.');
  assert.match(previewProblem('timeout', '', undefined, 'PC').message, /on your PC,/);
});

test('listPreviews records a valid hostPlatform for this host and ignores an invalid one', async () => {
  const { previewActions } = await import('../src/state/previewActions');
  let answer: Record<string, unknown> = {};
  const updates: Record<string, unknown>[] = [];
  const store = { state: { status: 'connected', previewAvailable: true, host: { id: 'h1' }, previewHost: null as unknown },
    epoch: 1, assertCurrent() {}, update(patch: Record<string, unknown>) { updates.push(patch); Object.assign(store.state, patch); },
    deps: { rpc: { request: async () => answer } } };
  const list = previewActions(store as never).listPreviews;
  answer = { targets: [], hostPlatform: 'windows' };
  assert.equal((await list()).hostPlatform, 'windows');
  assert.deepEqual(store.state.previewHost, { hostId: 'h1', platform: 'windows' });
  await list();
  assert.equal(updates.length, 1, 'an unchanged platform does not update the store again');
  answer = { targets: [], hostPlatform: 'Windows 11' };
  assert.equal((await list()).hostPlatform, undefined);
  assert.equal(updates.length, 1);
});
