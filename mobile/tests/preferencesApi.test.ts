import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreferencesApi, PreferencesError } from '../src/vibes/preferencesApi';
import { preferencesServer } from './preferencesServer';
import { preferenceRevision } from '../src/vibes/preferenceChanges';

const base = 'https://vibyra.test/';
const failure = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { assert.ok(error instanceof PreferencesError); return error; }
  assert.fail('expected the call to fail');
};

test('asks with the bearer it is given and reads the contract shapes', async () => {
  const seen: RequestInit[] = [];
  const server = preferencesServer();
  const api = createPreferencesApi(base, async () => 'guest-token', (input, init) => { seen.push(init!); return server.fetch(input, init); });
  assert.deepEqual(await api.getPreferences(), server.state.preferences);
  const list = await api.listMemories();
  assert.equal(list.memories.length, 5);
  assert.deepEqual(list.memories.map(memory => memory.source), ['user', 'chat', 'user', 'user', 'user']);
  assert.equal(list.limit, 50);
  assert.equal((seen[0]!.headers as Record<string, string>).Authorization, 'Bearer guest-token');
  assert.deepEqual(server.calls, ['GET preferences', 'GET memories']);
});

test('sends only the fields that change, with the right verbs', async () => {
  const server = preferencesServer();
  const api = createPreferencesApi(base, () => 'token', server.fetch);
  const saved = await api.savePreferences({ style: 'friendly', instructions: undefined });
  assert.equal(saved.style, 'friendly');
  await api.addMemory('Likes tabs.');
  const first = server.state.memories[0]!;
  assert.equal(first.text, 'Likes tabs.');
  await api.removeMemory(first.id);
  await api.clearMemories();
  assert.deepEqual(server.calls, ['POST preferences {"style":"friendly"}', 'POST memories {"text":"Likes tabs."}',
    `DELETE memories/${first.id}`, 'DELETE memories']);
});

test('an older server’s preferences read as empty parts, switched on', async () => {
  const older = { ok: true, preferences: { style: 'detailed', instructions: 'Be brief.', memoryEnabled: false } };
  const api = createPreferencesApi(base, () => 'token', async () => new Response(JSON.stringify(older), { status: 200 }));
  assert.deepEqual(await api.getPreferences(), { style: 'detailed', instructions: 'Be brief.', memoryEnabled: false,
    name: '', nameEnabled: true, occupation: '', occupationEnabled: true, about: '', aboutEnabled: true, summary: '', summaryEnabled: true });
});

test('without an account or a guest session it asks nothing', async () => {
  const server = preferencesServer();
  const api = createPreferencesApi(base, async () => null, server.fetch);
  assert.equal(await api.signedIn(), false);
  const error = await failure(api.getPreferences());
  assert.equal(error.kind, 'signedOut');
  assert.deepEqual(server.calls, []);
});

test('a server without the routes is "not available", never Laravel’s own sentence', async () => {
  const api = createPreferencesApi(base, () => 'token', preferencesServer({ mode: 'missing' }).fetch);
  const error = await failure(api.savePreferences({ style: 'detailed' }));
  assert.equal(error.kind, 'unavailable');
  assert.equal(error.status, 405);
  assert.doesNotMatch(error.message, /method is not supported/);
  const bare = createPreferencesApi(base, () => 'token', async () => new Response('<html>Not Found</html>', { status: 404 }));
  assert.equal((await failure(bare.listMemories())).kind, 'unavailable');
});

test('a memory already removed is "gone"; a refusal keeps the server’s sentence', async () => {
  const server = preferencesServer();
  const api = createPreferencesApi(base, () => 'token', server.fetch);
  const gone = await failure(api.removeMemory('00000000-0000-4000-8000-999999999999'));
  assert.equal(gone.kind, 'gone');
  assert.equal(gone.message, 'That memory was already removed.');
  const full = preferencesServer({ memories: Array.from({ length: 50 }, (_, index) => `Memory number ${index + 1}.`) });
  const refused = await failure(createPreferencesApi(base, () => 'token', full.fetch).addMemory('One more.'));
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.message, 'You can keep up to 50 memories. Remove one to add another.');
  server.fail.set('POST preferences', { status: 500 });
  const down = await failure(api.savePreferences({ memoryEnabled: false }));
  assert.equal(down.kind, 'refused');
  assert.match(down.message, /couldn’t answer just now/);
});

test('no answer at all is "offline", and a body that is not the contract is "unavailable"', async () => {
  const offline = createPreferencesApi(base, () => 'token', preferencesServer({ mode: 'offline' }).fetch);
  const error = await failure(offline.getPreferences());
  assert.equal(error.kind, 'offline');
  assert.equal(error.status, 0);
  const odd = createPreferencesApi(base, () => 'token', async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  assert.equal((await failure(odd.listMemories())).kind, 'unavailable');
  assert.equal((await failure(odd.getPreferences())).kind, 'unavailable');
});

test('a rejected session reads as signed out, so the rows go away rather than erroring', async () => {
  const api = createPreferencesApi(base, () => 'expired', async () => new Response(JSON.stringify({ ok: false, error: 'Sign in again.' }), { status: 401 }));
  const error = await failure(api.getPreferences());
  assert.equal(error.kind, 'signedOut');
  assert.equal(error.message, 'Sign in again.');
});

test('successful memory and personality writes invalidate a prepared chat quote', async () => {
  const api = createPreferencesApi(base, () => 'token', preferencesServer().fetch);
  const before = preferenceRevision();
  await api.getPreferences(); assert.equal(preferenceRevision(), before);
  await api.savePreferences({ style: 'concise' }); assert.equal(preferenceRevision(), before + 1);
  await api.addMemory('Prefers TypeScript.'); assert.equal(preferenceRevision(), before + 2);
  await api.clearMemories(); assert.equal(preferenceRevision(), before + 3);
});

test('a late response from another account is rejected rather than rendered as current preferences', async () => {
  let token = 'first';
  const server = preferencesServer();
  const api = createPreferencesApi(base, () => token, async (input, init) => {
    const response = await server.fetch(input, init); token = 'second'; return response;
  });
  assert.equal((await failure(api.getPreferences())).kind, 'signedOut');
});
