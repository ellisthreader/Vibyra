import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewOutboundQueue } from '../src/transport/PreviewOutboundQueue';

const frame = (value: number) => Uint8Array.of(value);

test('Cloud Preview sends Open before its initial Credit while prioritizing other streams', () => {
  const queue = new PreviewOutboundQueue(8);
  queue.push(frame(1), 'stream', false);
  queue.push(frame(2), 'stream', true);
  queue.push(frame(3), 'stream', true);
  queue.push(frame(4), 'other', true);
  assert.deepEqual([queue.pop()?.[0], queue.pop()?.[0], queue.pop()?.[0], queue.pop()?.[0]], [4, 1, 2, 3]);
  assert.equal(queue.byteLength, 0);
});

test('fairness cannot overtake earlier Credits for the same stream', () => {
  const queue = new PreviewOutboundQueue(64);
  for (let index = 0; index < 8; index++) {
    queue.push(frame(index), 'other', true);
    assert.equal(queue.pop()?.[0], index);
  }
  queue.push(frame(8), 'page', true);
  queue.push(frame(9), 'page', false);
  assert.deepEqual([queue.pop()?.[0], queue.pop()?.[0]], [8, 9]);
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

test('a new request makes progress while other streams keep granting credit', () => {
  const queue = new PreviewOutboundQueue(64);
  queue.push(frame(99), 'new-request', false);
  const sent: number[] = [];
  for (let index = 0; index < 20; index++) {
    queue.push(frame(index), 'busy-image', true);
    sent.push(queue.pop()![0]);
  }
  assert.ok(sent.indexOf(99) >= 0 && sent.indexOf(99) <= 8);
  assert.deepEqual(sent.filter(value => value !== 99),
    Array.from({ length: 19 }, (_, index) => index));
});
