import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewOutboundQueue } from '../src/transport/PreviewOutboundQueue';

const frame = (value: number) => Uint8Array.of(value);

test('urgent cumulative Preview credit preserves arrival order ahead of data', () => {
  const queue = new PreviewOutboundQueue(8);
  queue.push(frame(1), 'stream', false);
  queue.push(frame(2), 'stream', true);
  queue.push(frame(3), 'stream', true);
  queue.push(frame(4), 'other', true);
  assert.deepEqual([queue.pop()?.[0], queue.pop()?.[0], queue.pop()?.[0], queue.pop()?.[0]], [2, 3, 4, 1]);
  assert.equal(queue.byteLength, 0);
});

test('cancellation removes only unsent frames for its stream', () => {
  const queue = new PreviewOutboundQueue(8);
  queue.push(frame(1), 'other', false);
  queue.push(frame(2), 'stream', true);
  queue.push(frame(3), 'stream', false);
  queue.cancelKey('stream');
  queue.push(frame(4), 'stream', true);
  assert.deepEqual([queue.pop()?.[0], queue.pop()?.[0]], [4, 1]);
  assert.equal(queue.length, 0);
});
