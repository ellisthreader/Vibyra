import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetRemembered, recallProjects, rememberProjects } from '../src/state/projectMemory';
import type { WorkspaceStore } from '../src/state/WorkspaceStore';

// The folders a computer was last seen sharing, kept so the Projects page has
// something to read while that computer is away. A cache, so every failure in
// here has to be survivable: the phone still has to reconnect.
function fake() {
  const written = new Map<string, string>();
  const store = { deps: { flags: {
    read: async (key: string) => written.get(key) ?? null,
    write: async (key: string, value: string) => { written.set(key, value); },
    delete: async (key: string) => { written.delete(key); },
  } } } as unknown as WorkspaceStore;
  return { store, written };
}
const project = (id: string) => ({ id, name: id, path: `/Users/someone/Code/${id}`, branch: 'main' });

test('what a computer shares is remembered under its own id, and read back', async () => {
  const { store, written } = fake();
  await rememberProjects(store, 'host-1', [project('site'), project('api')]);
  assert.deepEqual([...written.keys()], ['projects.host-1'], 'kept under the computer it belongs to');
  const back = await recallProjects(store, 'host-1');
  assert.deepEqual(back?.projects.map(entry => entry.id), ['site', 'api']);
  assert.ok(Date.parse(back!.seenAt) > 0, 'and when it was last seen');
  // Another computer's memory is not this one's.
  assert.equal(await recallProjects(store, 'host-2'), null);
});

test('a cache that cannot be read is nothing to show, never a throw', async () => {
  const { store, written } = fake();
  for (const value of ['not json', '{}', '{"version":99,"projects":[]}', '{"version":1,"projects":"nope"}',
    '{"version":1,"projects":[{"id":"x"}]}']) {
    written.set('projects.host-1', value);
    assert.equal(await recallProjects(store, 'host-1'), null, value);
  }
  // A read that throws outright is still only an empty page.
  const broken = { deps: { flags: { read: async () => { throw new Error('keychain'); },
    write: async () => {}, delete: async () => {} } } } as unknown as WorkspaceStore;
  assert.equal(await recallProjects(broken, 'host-1'), null);
});

test('the cache is bounded, because a keychain value is not a database', async () => {
  const { store } = fake();
  const many = Array.from({ length: 80 }, (_, at) => project(`p${at}`));
  await rememberProjects(store, 'host-1', many);
  assert.equal((await recallProjects(store, 'host-1'))?.projects.length, 32);
  // A path no folder could have is dropped rather than stored.
  await rememberProjects(store, 'host-2', [{ id: 'big', name: 'big', path: 'x'.repeat(4096) }]);
  assert.equal(await recallProjects(store, 'host-2'), null);
});

test('a computer that shares nothing, or is forgotten, leaves nothing behind', async () => {
  const { store, written } = fake();
  await rememberProjects(store, 'host-1', [project('site')]);
  await rememberProjects(store, 'host-1', []);
  assert.equal(written.size, 0, 'sharing nothing clears the memory rather than keeping a stale one');
  await rememberProjects(store, 'host-1', [project('site')]);
  await forgetRemembered(store, 'host-1');
  assert.equal(await recallProjects(store, 'host-1'), null);
});
