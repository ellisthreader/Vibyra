import test from 'node:test';
import assert from 'node:assert/strict';
import { delay, runtimeHarness } from './runtimeHarness';

test('the accent is saved like the theme and comes back on the next launch', async () => {
  const first = runtimeHarness();
  assert.equal(first.store.state.accent, 'cobalt');
  first.store.actions.setAccent!('teal'); await delay();
  assert.equal(first.store.state.accent, 'teal');
  assert.equal(first.memory.get('accent'), 'teal');
  first.store.dispose();
  const next = runtimeHarness(); next.memory.set('accent', 'teal');
  await next.store.initialize(); await delay();
  assert.equal(next.store.state.accent, 'teal');
  next.store.dispose();
});
test('a saved value that is not an accent is ignored, and nothing unknown is written', async () => {
  const h = runtimeHarness(); h.memory.set('accent', 'magenta');
  await h.store.initialize(); await delay();
  assert.equal(h.store.state.accent, 'cobalt');
  h.store.actions.setAccent!('toString' as never); await delay();
  assert.equal(h.memory.get('accent'), 'magenta', 'an unknown id is not saved over the stored value');
  assert.equal(h.store.state.accent, 'cobalt');
  h.store.dispose();
});
test('the terminal text size comes back on the next launch, held to the readable range', async () => {
  const h = runtimeHarness(); h.memory.set('terminalFontSize', '17');
  await h.store.initialize(); await delay();
  assert.equal(h.store.state.terminalFontSize, 17);
  h.store.dispose();
  const wide = runtimeHarness(); wide.memory.set('terminalFontSize', '99');
  await wide.store.initialize(); await delay();
  assert.equal(wide.store.state.terminalFontSize, 20);
  wide.store.dispose();
  const junk = runtimeHarness(); junk.memory.set('terminalFontSize', 'large');
  await junk.store.initialize(); await delay();
  assert.equal(junk.store.state.terminalFontSize, 13);
  junk.store.dispose();
});
test('a colour picked before the saved one is read stands', async () => {
  const h = runtimeHarness(); h.memory.set('accent', 'teal');
  const starting = h.store.initialize();
  h.store.actions.setAccent!('ember');
  await starting; await delay();
  assert.equal(h.store.state.accent, 'ember');
  h.store.dispose();
});
