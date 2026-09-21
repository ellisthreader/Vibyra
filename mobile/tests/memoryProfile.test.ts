import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSamplePreferences, sampleProfile } from '../src/demo/samplePreferences';
import { Personalization } from '../src/settings/personalization';
import { memoryNotes } from '../src/vibes/memoryChanges';
import { createPreferencesApi, type PreferencesApi } from '../src/vibes/preferencesApi';
import { preferencesServer } from './preferencesServer';

const setup = () => {
  const server = preferencesServer();
  const store = new Personalization(createPreferencesApi('https://vibyra.test', () => 'token', server.fetch));
  return { server, store };
};

test('each part’s switch applies on the tap and goes back if refused', async () => {
  const { store, server } = setup();
  await store.load();
  await store.setSwitch('summaryEnabled', false);
  assert.equal(store.state.preferences?.summaryEnabled, false);
  assert.deepEqual(server.calls.at(-1), 'POST preferences {"summaryEnabled":false}');
  server.fail.set('POST preferences', { status: 500, error: 'Vibyra couldn’t answer just now. Please try again.' });
  const pending = store.setSwitch('nameEnabled', false);
  assert.equal(store.state.preferences?.nameEnabled, false, 'applied before the answer');
  await pending;
  assert.equal(store.state.preferences?.nameEnabled, true);
  assert.equal(store.state.error, 'Vibyra couldn’t answer just now. Please try again.');
});

test('a name is one line, a summary keeps its lines, and "Saved" names the box that saved', async () => {
  const { store, server } = setup();
  await store.load();
  assert.equal(await store.saveText('name', '  Ellis \n Threader '), true);
  assert.equal(store.state.preferences?.name, 'Ellis Threader');
  assert.equal(store.state.savedField, 'name');
  assert.equal(await store.saveText('summary', 'Line one.\r\n\r\nLine two.  '), true);
  assert.equal(server.state.preferences.summary, 'Line one.\n\nLine two.');
  assert.equal(store.state.savedField, 'summary');
  const calls = server.calls.length;
  assert.equal(await store.saveText('summary', 'Line one.\n\nLine two.'), true, 'unchanged words are already saved');
  assert.equal(server.calls.length, calls);
});

test('a refused part keeps its words out of the page and says why in the server’s words', async () => {
  const { store } = setup();
  await store.load();
  assert.equal(await store.saveText('summary', 'x'.repeat(8001)), false);
  assert.equal(store.state.error, 'Keep your memory summary to 8,000 characters.');
  assert.equal(store.state.preferences?.summary, sampleProfile.summary);
  assert.equal(store.state.savedAt, null);
  assert.equal(store.state.busy, null);
});

test('a box saving never holds up the memory list', async () => {
  const server = preferencesServer({ delay: 30 });
  const store = new Personalization(createPreferencesApi('https://vibyra.test', () => 'token', server.fetch));
  await store.load();
  const saving = store.saveText('about', 'Runs on weekends.');
  assert.equal(store.state.busy, 'about');
  assert.equal(await store.addMemory('Likes tea.'), true, 'the add is not refused while the box saves');
  await saving;
  assert.equal(store.state.busy, null);
  assert.equal(server.state.preferences.about, 'Runs on weekends.');
  assert.equal(store.state.memories?.[0]?.text, 'Likes tea.');
});

test('the sample keeps its parts in memory and refuses what the server refuses', async () => {
  const sample: PreferencesApi = createSamplePreferences();
  assert.equal((await sample.getPreferences()).name, sampleProfile.name);
  assert.equal((await sample.savePreferences({ occupation: 'Designer' })).occupation, 'Designer');
  assert.equal((await sample.getPreferences()).name, sampleProfile.name, 'only what was sent moves');
  await assert.rejects(sample.savePreferences({ name: 'n'.repeat(61) }), /Keep your name to 60 characters\./);
});

test('a reply’s memory line reads what it changed, and ignores what it cannot read', () => {
  assert.deepEqual(memoryNotes({ memory: { saved: [{ id: 'a', text: 'Prefers TypeScript.' }], forgotten: ['Lives in London.'] } }),
    ['Saved to memory: Prefers TypeScript.', 'Removed from memory: Lives in London.']);
  assert.deepEqual(memoryNotes({ memory: { full: true } }), ['Memory is full. Remove a memory to save more.']);
  assert.deepEqual(memoryNotes({ memory: null }), []);
  assert.deepEqual(memoryNotes({}), []);
  assert.deepEqual(memoryNotes({ memory: { saved: 'nope', forgotten: [3] } as never }), []);
});
