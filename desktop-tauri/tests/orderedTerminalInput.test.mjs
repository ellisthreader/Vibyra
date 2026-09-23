import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrderedTerminalWriter } from '../src/lib/orderedTerminalInput.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('rapid keys, Backspace, paste and Enter reach one PTY in exact order', async () => {
  const first = deferred();
  const sent = [];
  const write = createOrderedTerminalWriter(async (id, data) => {
    sent.push([id, data]);
    if (sent.length === 1) await first.promise;
  });

  const calls = ['h', 'e', 'l', 'x', '\x7f', 'lo', '\r'].map(data => write(7, data));
  assert.deepEqual(sent, [[7, 'h']]);
  first.resolve();
  await Promise.all(calls);
  assert.deepEqual(sent, [[7, 'h'], [7, 'elx\x7flo\r']]);
  assert.equal(sent.map(([, data]) => data).join(''), 'helx\x7flo\r');
});

test('a stalled terminal does not delay another terminal', async () => {
  const first = deferred();
  const sent = [];
  const write = createOrderedTerminalWriter(async (id, data) => {
    sent.push([id, data]);
    if (id === 1) await first.promise;
  });
  const slow = write(1, 'a');
  await write(2, 'b');
  assert.deepEqual(sent, [[1, 'a'], [2, 'b']]);
  first.resolve();
  await slow;
});

test('a failed write rejects its callers and allows the next write', async () => {
  let attempts = 0;
  const write = createOrderedTerminalWriter(async () => {
    if (++attempts === 1) throw new Error('PTY closed');
  });
  await assert.rejects(write('session', 'a'), /PTY closed/);
  await write('session', 'b');
  assert.equal(attempts, 2);
});
