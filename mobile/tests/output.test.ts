import test from 'node:test';
import assert from 'node:assert/strict';
import { OutputLedger, byteLength, type OutputFrame } from '../src/state/output';
const frame = (output: string, offset: number, generation = 'g1'): OutputFrame => ({ sessionId: 's1', output, offset, generation });

test('snapshot reconciles buffered events using UTF-8 byte end offsets', () => {
  const output = new OutputLedger('s1');
  output.push(frame('hé🌍', 7));
  output.push(frame(' done', 12));
  output.snapshot({ ...frame('hé🌍', 7), status: 'running' });
  assert.equal(output.output, 'hé🌍 done');
  assert.equal(output.offset, 12);
  output.push(frame(' done', 12));
  assert.equal(output.output, 'hé🌍 done');
});
test('partially overlapping output appends only new whole Unicode characters', () => {
  const output = new OutputLedger('s1');
  output.snapshot({ ...frame('hé', 3), status: 'running' });
  output.push(frame('é🌍!', 8));
  assert.equal(output.output, 'hé🌍!');
  assert.equal(byteLength(output.output), 8);
});
test('output from other sessions is ignored and missing bytes require refresh', () => {
  const output = new OutputLedger('s1');
  output.snapshot({ ...frame('start', 5), status: 'running' });
  output.push({ ...frame('secret', 6), sessionId: 'another-computer' });
  assert.equal(output.output, 'start');
  assert.throws(() => output.push(frame('gap', 12)), /interrupted/);
  assert.equal(output.output, 'start');
});
test('a new generation cannot append to the previous process output', () => {
  const output = new OutputLedger('s1');
  output.push(frame('obsolete', 8, 'old'));
  output.snapshot({ ...frame('new', 3, 'g1'), status: 'running' });
  assert.equal(output.output, 'new');
  assert.throws(() => output.push(frame('another', 7, 'g2')), /restarted/);
});
test('invalid byte offsets and split Unicode overlaps fail safely', () => {
  const output = new OutputLedger('s1');
  assert.throws(() => output.push(frame('🌍', 1)), /invalid/);
  output.snapshot({ ...frame('a', 1), status: 'running' });
  assert.throws(() => output.push(frame('🌍', 4)), /boundary/);
});
