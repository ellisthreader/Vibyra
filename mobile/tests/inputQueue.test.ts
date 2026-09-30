import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InputQueue } from '../src/state/inputQueue';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('keys pressed while a request is out go together, in order, as the next one', async () => {
  const sent: string[] = [];
  const releases: (() => void)[] = [];
  const queue = new InputQueue(data => { sent.push(data); return new Promise<void>(resolve => { releases.push(resolve); }); });
  const first = queue.push('p');
  void queue.push('r'); void queue.push('i'); void queue.push('n');
  assert.deepEqual(sent, ['p'], 'the first key goes at once');
  releases[0]();
  await settle();
  assert.deepEqual(sent, ['p', 'rin'], 'the keys typed meanwhile went as one request, after the first');
  releases[1]();
  await first;
});

test('a failed request drops what was typed behind it rather than sending it out of place', async () => {
  const sent: string[] = [];
  const queue = new InputQueue(async data => { sent.push(data); if (data === 'x') throw new Error('lost'); });
  const failed = queue.push('x');
  void queue.push('y').catch(() => {});
  await assert.rejects(failed, /lost/);
  await queue.push('z');
  assert.deepEqual(sent, ['x', 'z']);
});

test('one message never exceeds the computer limit', async () => {
  const sent: string[] = [];
  const queue = new InputQueue(async data => { sent.push(data); });
  await queue.push('a'.repeat(5000));
  assert.deepEqual(sent.map(item => item.length), [2048, 2048, 904]);
});
