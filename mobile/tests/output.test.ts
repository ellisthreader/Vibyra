import test from 'node:test';
import assert from 'node:assert/strict';
import { OutputLedger, byteLength, readableStart, type OutputFrame } from '../src/state/output';
const frame = (output: string, offset: number, generation = 'g1'): OutputFrame => ({ sessionId: 's1', output, offset, generation });

test('a tail that begins inside an escape sequence starts at the next line, with offsets untouched', () => {
  // The computer's ring wrapped nine bytes into a truecolor escape, so the
  // snapshot opens with the rest of it — which xterm would print as letters.
  const cut = '2;91;124;250mfirst line\r\n\x1b[32msecond line\x1b[0m\r\n';
  const ledger = new OutputLedger('s1');
  ledger.snapshot({ ...frame(cut, 1000), status: 'running', truncated: true });
  assert.equal(ledger.output, '\x1b[32msecond line\x1b[0m\r\n');
  assert.equal(ledger.offset, 1000, 'the byte offset still counts everything the computer sent');
  ledger.push(frame('more', 1004));
  assert.equal(ledger.output, '\x1b[32msecond line\x1b[0m\r\nmore');
});
test('a complete snapshot is drawn from its first byte', () => {
  const ledger = new OutputLedger('s1');
  ledger.snapshot({ ...frame('$ ls\r\nREADME.md\r\n', 17), status: 'running', truncated: false });
  assert.equal(ledger.output, '$ ls\r\nREADME.md\r\n');
});
test('a frame with no line breaks starts at its first escape rather than mid-sequence', () => {
  assert.equal(readableStart('4;250mtext\x1b[1mbold'), '\x1b[1mbold');
  assert.equal(readableStart('plain words only'), 'plain words only');
  // A line break too far in to be the start of anything, and no escape at all: nothing to cut.
  const long = 'x'.repeat(5000) + '\nlate';
  assert.equal(readableStart(long), long);
});

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
