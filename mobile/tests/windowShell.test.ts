import assert from 'node:assert/strict';
import test from 'node:test';
import { windowCommand, windowShellScript } from '../src/preview/windowShell';

const start = 'http://127.0.0.1:52100/';
const message = (kind: string, url = start) => JSON.stringify({ preview: 1, kind, url });

test('the window viewer can close the Preview, open the window list and take the screen', () => {
  const calls: string[] = [];
  const actions = { close: () => calls.push('close'), targets: () => calls.push('targets') };
  assert.equal(windowCommand(message('close'), start, start, actions), true);
  assert.equal(windowCommand(message('targets'), start, start, actions), true);
  assert.equal(windowCommand(message('controls'), start, start, { ...actions, controls: () => calls.push('controls') }), true);
  assert.deepEqual(calls, ['close', 'targets', 'controls']);
});

test('nothing else, and nothing from another page, counts as a command', () => {
  let calls = 0;
  const actions = { close: () => { calls++; } };
  assert.equal(windowCommand(message('targets'), start, start, actions), false, 'no window list to open');
  assert.equal(windowCommand(message('ready'), start, start, actions), false);
  assert.equal(windowCommand(message('close', 'https://example.com/'), 'https://example.com/', start, actions), false);
  assert.equal(windowCommand(message('close', `${start}other`), start, start, actions), false, 'the url must be the page itself');
  assert.equal(windowCommand(`${message('close').slice(0, -1)},"pad":"${'x'.repeat(300)}"}`, start, start, actions), false);
  assert.equal(windowCommand('not json', start, start, actions), false);
  assert.equal(calls, 0);
});

test('the viewer learns what it may offer and the accent to draw with', () => {
  const script = windowShellScript({ targets: true, accent: '#4667E8', label: 'Staff "sign" in' });
  const window: { vibyraShell?: unknown } = {};
  new Function('window', script)(window);
  assert.deepEqual(window.vibyraShell, { close: true, targets: true, accent: '#4667E8', label: 'Staff "sign" in' });
});
