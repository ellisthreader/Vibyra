import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeHarness } from './runtimeHarness';

test('terminal frames update the terminal without rerendering the app shell', () => {
  const { store } = runtimeHarness();
  let views = 0;
  let outputs = 0;
  const stopView = store.subscribeView(() => { views++; });
  const stopOutput = store.terminalOutput.subscribe(() => { outputs++; });
  const before = store.viewSnapshot();
  store.update({ output: 'one' });
  store.update({ output: 'two' });
  assert.equal(views, 0);
  assert.equal(outputs, 2);
  assert.equal(store.viewSnapshot(), before);
  assert.equal(store.terminalOutput.snapshot(), 'two');
  store.update({ status: 'connected', output: 'three' });
  assert.equal(views, 1);
  assert.equal(outputs, 3);
  assert.equal(store.viewSnapshot().output, 'three');
  stopView(); stopOutput(); store.dispose();
});
