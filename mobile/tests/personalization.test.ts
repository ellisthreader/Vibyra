import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Personalization, personalizationRows } from '../src/settings/personalization';
import { createPreferencesApi, type PreferencesApi } from '../src/vibes/preferencesApi';
import { preferencesServer } from './preferencesServer';

const setup = (options: Parameters<typeof preferencesServer>[0] = {}, token: string | null = 'token') => {
  const server = preferencesServer(options);
  const store = new Personalization(createPreferencesApi('https://vibyra.test', () => token, server.fetch));
  return { server, store };
};
/** An api whose answers are held until the test releases them, to land them out of order. */
function held(api: PreferencesApi) {
  const gates: (() => void)[] = [];
  const wrap = <T>(call: () => Promise<T>) => new Promise<void>(resolve => gates.push(resolve)).then(call);
  return { gates, api: { ...api, savePreferences: (changes: Parameters<PreferencesApi['savePreferences']>[0]) => wrap(() => api.savePreferences(changes)) } };
}

test('loads both halves, and the home rows read them', async () => {
  const { store } = setup();
  assert.deepEqual(personalizationRows(store.state), { personality: null, memory: null });
  await store.load();
  assert.equal(store.state.status, 'ready');
  assert.deepEqual(personalizationRows(store.state), { personality: 'Concise', memory: 'On · 5' });
});

test('with nobody to ask for, the rows stay without a value and nothing is asked', async () => {
  const { store, server } = setup({}, null);
  assert.deepEqual(personalizationRows(store.state), { personality: null, memory: null }, 'there from the first frame');
  await store.load();
  assert.equal(store.state.status, 'signedOut');
  assert.deepEqual(personalizationRows(store.state), { personality: null, memory: null });
  assert.deepEqual(server.calls, []);
});

test('a server without the routes is "not available"; no answer says why', async () => {
  const missing = setup({ mode: 'missing' });
  await missing.store.load();
  assert.equal(missing.store.state.status, 'unavailable');
  assert.equal(missing.store.state.problem, null);
  assert.deepEqual(personalizationRows(missing.store.state), { personality: null, memory: null }, 'rows stay, without a value');
  const offline = setup({ mode: 'offline' });
  await offline.store.load();
  assert.match(offline.store.state.problem ?? '', /couldn’t be reached/);
});

test('a style changes on the tap and goes back if the server refuses', async () => {
  const { store, server } = setup();
  await store.load();
  server.fail.set('POST preferences', { status: 500, error: 'Vibyra couldn’t answer just now. Please try again.' });
  const pending = store.setStyle('friendly');
  assert.equal(store.state.preferences?.style, 'friendly', 'applied before the answer');
  await pending;
  assert.equal(store.state.preferences?.style, 'concise');
  assert.equal(store.state.error, 'Vibyra couldn’t answer just now. Please try again.');
  await store.setStyle('detailed');
  assert.equal(store.state.error, null, 'the next change clears the last refusal');
  assert.equal(server.state.preferences.style, 'detailed');
});

test('only the newest tap decides, whichever answer lands last', async () => {
  const server = preferencesServer();
  const gate = held(createPreferencesApi('https://vibyra.test', () => 'token', server.fetch));
  const store = new Personalization(gate.api);
  await store.load();
  const first = store.setStyle('friendly');
  const second = store.setStyle('balanced');
  gate.gates[1]!(); await second;
  gate.gates[0]!(); await first;
  assert.equal(store.state.preferences?.style, 'balanced');
});

test('instructions say "Saved" only once the server has them', async () => {
  const { store, server } = setup();
  await store.load();
  server.fail.set('POST preferences', { status: 422, error: 'Keep instructions to 1,000 characters.' });
  assert.equal(await store.saveInstructions('x'.repeat(999)), false);
  assert.equal(store.state.savedAt, null);
  assert.equal(store.state.error, 'Keep instructions to 1,000 characters.');
  assert.equal(await store.saveInstructions('  Be brief.\r\n'), true);
  assert.equal(store.state.preferences?.instructions, 'Be brief.');
  assert.ok(store.state.savedAt);
  assert.equal(await store.saveInstructions('Be brief.'), true, 'unchanged words are already saved');
  assert.equal(server.calls.filter(call => call.startsWith('POST preferences')).length, 2);
});

test('memory: switch, add, the limit in the server’s words, remove and clear', async () => {
  const { store, server } = setup();
  await store.load();
  await store.setMemoryEnabled(false);
  assert.deepEqual(personalizationRows(store.state), { personality: 'Concise', memory: 'Off' });
  assert.equal(await store.addMemory('  Prefers   dark mode. '), true);
  assert.equal(store.state.memories?.[0]?.text, 'Prefers dark mode.');
  server.state.limit = 6;
  assert.equal(await store.addMemory('One too many.'), false);
  assert.equal(store.state.error, 'You can keep up to 50 memories. Remove one to add another.');
  const british = store.state.memories!.find(memory => memory.text === 'Writes in British English.')!;
  await store.removeMemory(british.id);
  assert.equal(store.state.memories?.some(memory => memory.id === british.id), false);
  await store.clearMemories();
  assert.deepEqual(store.state.memories, []);
  assert.deepEqual(server.state.memories, []);
});

test('a refused removal comes back in its place; one already gone just catches up', async () => {
  const { store, server } = setup();
  await store.load();
  const order = store.state.memories!.map(memory => memory.id);
  server.fail.set(`DELETE memories/${order[2]}`, { status: 500 });
  await store.removeMemory(order[2]!);
  assert.deepEqual(store.state.memories!.map(memory => memory.id), order);
  assert.ok(store.state.error);
  server.state.memories = server.state.memories.filter(memory => memory.id !== order[0]);
  await store.removeMemory(order[0]!);
  assert.equal(store.state.error, null);
  assert.deepEqual(store.state.memories!.map(memory => memory.id), order.slice(1));
});

test('a refused clear puts the list back', async () => {
  const { store, server } = setup();
  await store.load();
  server.fail.set('DELETE memories', { status: 503 });
  await store.clearMemories();
  assert.equal(store.state.memories?.length, 5);
  assert.match(store.state.error ?? '', /couldn’t answer/);
});
