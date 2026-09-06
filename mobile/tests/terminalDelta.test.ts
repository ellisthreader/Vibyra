import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outputDelta } from '../src/terminal/outputDelta';

test('bounded streaming history appends new output without resetting terminal', () => {
  const previous = Array.from({ length: 9000 }, (_, i) => `line ${i}: 🧑‍💻\r\n`).join('');
  const tail = 'next result 日本語\r\n';
  const next = previous.slice(5000) + tail;
  assert.deepEqual(outputDelta(previous, next), { reset: false, data: tail });
});
test('repetitive build output finds overlap without quadratic scanning', () => {
  const previous = 'building\r\n'.repeat(24000);
  assert.deepEqual(outputDelta(previous, previous.slice(5000) + 'finished'), { reset: false, data: 'finished' });
});
test('unrelated snapshot resets; ordinary and empty updates remain exact', () => {
  assert.deepEqual(outputDelta('hello', 'hello world'), { reset: false, data: ' world' });
  assert.deepEqual(outputDelta('hello', 'hello'), { reset: false, data: '' });
  assert.deepEqual(outputDelta('hello', 'replacement'), { reset: true, data: 'replacement' });
  assert.deepEqual(outputDelta('hello', ''), { reset: true, data: '' });
});
