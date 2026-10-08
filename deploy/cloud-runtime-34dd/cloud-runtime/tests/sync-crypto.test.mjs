import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sealBuffer, openBuffer, sealStream, openStream, generateKeyPair, publicFromSecret, MAGIC, CHUNK } from '../src/sync-crypto.mjs';

const vm = generateKeyPair();
const rand = n => crypto.randomBytes(n);
const reject = (secret, data, re = /./) => assert.rejects(openBuffer(secret, data), e => e.code === 'VSYNC_REJECT' && re.test(e.message));
// An independent implementation of the contract text (steps 1-3), used to check the module and the vectors.
function referenceSeal(R, e, plain) {
  const E = crypto.createPublicKey(crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), e]), format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).subarray(-32);
  const shared = crypto.diffieHellman({ privateKey: crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), e]), format: 'der', type: 'pkcs8' }),
    publicKey: crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), R]), format: 'der', type: 'spki' }) });
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.concat([E, R]), 'vibyra-sync-v1', 32)); const header = Buffer.concat([MAGIC, E]); const out = [header];
  const n = Math.max(1, Math.ceil(plain.length / CHUNK));
  for (let i = 0; i < n; i++) {
    const nonce = Buffer.alloc(12); nonce.writeBigUInt64BE(BigInt(i), 4); const c = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    c.setAAD(Buffer.concat([header, Buffer.from([i === n - 1 ? 1 : 0])]), { plaintextLength: Math.min(CHUNK, plain.length - i * CHUNK) });
    const ct = Buffer.concat([c.update(plain.subarray(i * CHUNK, (i + 1) * CHUNK)), c.final(), c.getAuthTag()]); const len = Buffer.alloc(4); len.writeUInt32BE(ct.length); out.push(len, ct);
  }
  return Buffer.concat(out);
}

test('round trip across chunk boundaries, including empty and exact multiples', async () => {
  for (const n of [0, 1, 100, CHUNK - 1, CHUNK, CHUNK + 1, 2 * CHUNK, 3 * CHUNK + 17]) {
    const plain = rand(n); const sealed = await sealBuffer(vm.public, plain);
    assert.ok(sealed.subarray(0, 7).equals(MAGIC)); assert.deepEqual(await openBuffer(vm.secret, sealed), plain, `size ${n}`);
  }
});
test('hex keys work and the public key derives from the secret', async () => {
  assert.ok(publicFromSecret(vm.secret).equals(vm.public));
  assert.deepEqual(await openBuffer(vm.secret.toString('hex'), await sealBuffer(vm.public.toString('hex'), Buffer.from('hi'))), Buffer.from('hi'));
  assert.throws(() => sealStream('zz'), /32 bytes/); assert.throws(() => openStream(Buffer.alloc(31)), /32 bytes/);
});
test('each seal uses a fresh ephemeral key', async () => { const a = await sealBuffer(vm.public, Buffer.from('x')), b = await sealBuffer(vm.public, Buffer.from('x')); assert.notDeepEqual(a.subarray(7, 39), b.subarray(7, 39)); });
test('module output matches the independent reference of the contract, byte for byte', async () => {
  const e = generateKeyPair(); for (const n of [0, 5, CHUNK, CHUNK + 3, 2 * CHUNK + 1]) { const plain = rand(n);
    assert.ok((await sealBuffer(vm.public, plain, { ephemeral: e })).equals(referenceSeal(vm.public, e.secret, plain)), `size ${n}`); }
});
test('rejection rules: magic, chunk length, missing final, trailing bytes, tags', async () => {
  const sealed = await sealBuffer(vm.public, rand(CHUNK * 2 + 5)); const chunkAt = [39, 39 + 4 + CHUNK + 16, 39 + 8 + 2 * (CHUNK + 16)];
  const bad = Buffer.from(sealed); bad[0] ^= 1; await reject(vm.secret, bad, /magic/);
  await reject(vm.secret, Buffer.alloc(0), /final|magic/); await reject(vm.secret, sealed.subarray(0, 20), /final/); await reject(vm.secret, sealed.subarray(0, 39), /final/);
  await reject(vm.secret, sealed.subarray(0, chunkAt[2]), /final/); // last chunk dropped at a chunk boundary
  await reject(vm.secret, sealed.subarray(0, chunkAt[1]), /final/);
  await reject(vm.secret, sealed.subarray(0, sealed.length - 1), /final/); // truncated inside the last chunk
  await reject(vm.secret, Buffer.concat([sealed, Buffer.from([0])]), /trailing/);
  const extra = Buffer.alloc(4 + 16); extra.writeUInt32BE(16); await reject(vm.secret, Buffer.concat([sealed, extra]), /trailing|authentication/);
  const huge = Buffer.from(sealed); huge.writeUInt32BE(CHUNK + 17, 39); await reject(vm.secret, huge, /length/);
  const tiny = Buffer.from(sealed); tiny.writeUInt32BE(15, 39); await reject(vm.secret, tiny, /length/);
});
test('tamper: any flipped bit in header, lengths, ciphertext or tag fails; wrong key fails; chunks cannot be reordered or truncated into a final', async () => {
  const sealed = await sealBuffer(vm.public, rand(CHUNK * 2 + 5));
  for (const at of [7, 38, 45, 100, 39 + 4 + CHUNK + 16 + 4 + 3, sealed.length - 1, sealed.length - 20]) { const b = Buffer.from(sealed); b[at] ^= 0x40; await reject(vm.secret, b); }
  await reject(generateKeyPair().secret, sealed, /authentication/);
  const c0 = sealed.subarray(39, 39 + 4 + CHUNK + 16), c1 = sealed.subarray(39 + 4 + CHUNK + 16, 39 + 8 + 2 * (CHUNK + 16)), rest = sealed.subarray(39 + 8 + 2 * (CHUNK + 16));
  await reject(vm.secret, Buffer.concat([sealed.subarray(0, 39), c1, c0, rest]), /authentication/);
  // A non-final chunk replayed as the end of a shorter stream is not accepted as final.
  await reject(vm.secret, Buffer.concat([sealed.subarray(0, 39), c0, c1]), /final/);
});
test('streams: bytes delivered one at a time still open; errors surface through pipeline', async () => {
  const plain = rand(CHUNK + 9); const sealed = await sealBuffer(vm.public, plain); const open = openStream(vm.secret); const out = [];
  open.on('data', c => out.push(c)); const done = new Promise((res, rej) => open.on('end', res).on('error', rej));
  for (let i = 0; i < sealed.length; i += 997) open.write(sealed.subarray(i, i + 997)); open.end(); await done; assert.deepEqual(Buffer.concat(out), plain);
});
test('the Mac core vectors (docs/cloud-sync-vectors.json) seal to identical bytes, open, and every reject stream fails', async t => {
  const file = fileURLToPath(new URL('../../docs/cloud-sync-vectors.json', import.meta.url)); if (!fs.existsSync(file)) return t.skip('Mac vectors not present');
  const v = JSON.parse(fs.readFileSync(file, 'utf8')); const sha = b => crypto.createHash('sha256').update(b).digest('hex'); const plainOf = n => Buffer.from(Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255));
  const eph = { secret: Buffer.from(v.ephemeralSecretHex, 'hex'), public: Buffer.from(v.ephemeralPublicHex, 'hex') }; assert.ok(publicFromSecret(eph.secret).equals(eph.public)); assert.ok(publicFromSecret(v.recipientSecretHex).equals(Buffer.from(v.recipientPublicHex, 'hex')));
  const sealedBy = {};
  for (const c of v.cases) {
    const plain = plainOf(c.plaintextLength); assert.equal(sha(plain), c.plaintextSha256, c.name); const mine = await sealBuffer(v.recipientPublicHex, plain, { ephemeral: eph });
    assert.equal(mine.length, c.sealedLength, c.name); assert.equal(sha(mine), c.sealedSha256, c.name); if (c.sealedHex) assert.equal(mine.toString('hex'), c.sealedHex, c.name);
    assert.equal(sha(await openBuffer(v.recipientSecretHex, c.sealedHex ? Buffer.from(c.sealedHex, 'hex') : mine)), c.plaintextSha256, c.name); sealedBy[c.name] = mine;
  }
  for (const r of v.reject) await reject(v.recipientSecretHex, Buffer.from(r.sealedHex, 'hex'));
  const chunk = sealedBy.chunk_plus_one_65537; await reject(v.recipientSecretHex, chunk.subarray(0, 39 + 4 + CHUNK + 16)); // missing_final_chunk
  await reject(generateKeyPair().secret, sealedBy.one_byte); // wrong_recipient_key
});
