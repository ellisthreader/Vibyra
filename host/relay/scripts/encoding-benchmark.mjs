// Encoding-only investigation. This does not implement or negotiate a protocol.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const payload = Buffer.alloc(16384, 0x5a);
const clientId = '00000000-0000-0000-0000-000000000001';
const iterations = 10000;
const jsonWire = JSON.stringify({ type: 'frame', clientId, data: payload.toString('base64') });
const startJson = performance.now();
for (let i = 0; i < iterations; i++) {
  const wire = JSON.stringify({ type: 'frame', clientId, data: payload.toString('base64') });
  assert.equal(Buffer.from(JSON.parse(wire).data, 'base64').length, payload.length);
}
const jsonMs = performance.now() - startJson;
const startBinary = performance.now();
for (let i = 0; i < iterations; i++) {
  const wire = Buffer.concat([Buffer.alloc(40), payload]);
  assert.equal(wire.subarray(40).length, payload.length);
}
console.log(JSON.stringify({ scope: 'encoding-only-hypothetical-40-byte-binary-header', iterations,
  jsonWireBytes: Buffer.byteLength(jsonWire), binaryWireBytes: 40 + payload.length,
  jsonMs, binaryMs: performance.now() - startBinary, protocolShipped: false }));
