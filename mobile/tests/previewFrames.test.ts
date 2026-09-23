import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePreviewFrame, encodePreviewFrame, PREVIEW_CHUNK } from '../src/preview/frameCodec';
import { PreviewReceiveCredit, PreviewSendCredit } from '../src/preview/credit';

const key = { id: '18446744073709551615', generation: '7' };

test('iOS codec matches typed Preview frame layout and rejects malformed frames', () => {
  for (const frame of [
    { kind: 'open' as const, key },
    { kind: 'credit' as const, key, total: '65536' },
    { kind: 'data' as const, key, sequence: 0, bytes: Uint8Array.from([0, 1, 255]) },
    { kind: 'end' as const, key, sequence: 1 },
    { kind: 'cancel' as const, key },
  ]) assert.deepEqual(decodePreviewFrame(encodePreviewFrame(frame)), frame);
  assert.throws(() => encodePreviewFrame({ kind: 'open', key: { id: '0', generation: '1' } }), /identity/);
  assert.throws(() => encodePreviewFrame({ kind: 'data', key, sequence: 0, bytes: new Uint8Array(PREVIEW_CHUNK + 1) }), /chunk/);
  assert.throws(() => decodePreviewFrame('not base64'), /frame/);
  assert.throws(() => decodePreviewFrame(btoa('VP\x02\x01' + '\0'.repeat(16))), /header/);
});

test('10 MiB transfer stays within the 64 KiB unacknowledged response window', () => {
  const sender = new PreviewSendCredit();
  const receiver = new PreviewReceiveCredit();
  sender.grant(receiver.initialTotal);
  const chunk = new Uint8Array(PREVIEW_CHUNK).fill(0x5a);
  const deliver = (sequence: number) => {
    assert.equal(sender.take(chunk.length), true);
    const decoded = decodePreviewFrame(encodePreviewFrame({ kind: 'data', key, sequence, bytes: chunk }));
    assert.equal(decoded.kind, 'data');
    if (decoded.kind !== 'data') throw new Error('unexpected frame');
    receiver.accept(decoded.sequence, decoded.bytes.length);
  };
  for (let sequence = 0; sequence < 4; sequence++) deliver(sequence);
  assert.equal(sender.take(1), false);
  for (let sequence = 0; sequence < 640; sequence++) {
    sender.grant(receiver.acknowledge(chunk.length));
    if (sequence + 4 < 640) deliver(sequence + 4);
  }
  receiver.end(640);
  assert.throws(() => receiver.accept(640, 1), /out of order/);
  assert.throws(() => sender.grant('999999999'), /credit/);
});

test('duplicate or over-credit chunks are rejected before native response writes', () => {
  const receiver = new PreviewReceiveCredit();
  receiver.accept(0, 100);
  assert.throws(() => receiver.accept(0, 100), /out of order/);
  assert.throws(() => receiver.acknowledge(101), /acknowledgement/);
  receiver.acknowledge(100);
  assert.throws(() => receiver.accept(1, PREVIEW_CHUNK + 1), /credit/);
});
