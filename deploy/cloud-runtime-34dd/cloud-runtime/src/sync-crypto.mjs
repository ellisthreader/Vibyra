import crypto from 'node:crypto';
import { Transform } from 'node:stream';

// VSYNC1 (docs/cloud-sync-contract.md "Crypto"): X25519 ephemeral key, HKDF-SHA256, ChaCha20-Poly1305 in 64 KiB chunks.
export const MAGIC = Buffer.from('VSYNC1\n');
export const CHUNK = 65536;
export const TAG = 16;
export const HEADER = MAGIC.length + 32;
const INFO = Buffer.from('vibyra-sync-v1');
const SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex');

const hexKey = (value, what) => { const b = Buffer.isBuffer(value) ? value : /^[0-9a-f]{64}$/i.test(value ?? '') ? Buffer.from(value, 'hex') : null; if (b?.length !== 32) throw Error(`${what} must be 32 bytes`); return b; };
const publicObject = raw => crypto.createPublicKey({ key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki' });
const privateObject = raw => crypto.createPrivateKey({ key: Buffer.concat([PKCS8, raw]), format: 'der', type: 'pkcs8' });
const rawPublic = key => crypto.createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);

/** A fresh X25519 pair as raw 32-byte buffers. */
export function generateKeyPair() {
  const { privateKey } = crypto.generateKeyPairSync('x25519');
  const secret = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  return { secret: Buffer.from(secret), public: Buffer.from(rawPublic(privateKey)) };
}
/** The public key (32 bytes) belonging to a 32-byte X25519 secret. */
export const publicFromSecret = secret => Buffer.from(rawPublic(privateObject(hexKey(secret, 'secret'))));

const sessionKey = (secret, peerPublic, ephemeral, recipient) => Buffer.from(crypto.hkdfSync('sha256',
  crypto.diffieHellman({ privateKey: privateObject(secret), publicKey: publicObject(peerPublic) }), Buffer.concat([ephemeral, recipient]), INFO, 32));
const nonceFor = index => { const n = Buffer.alloc(12); n.writeBigUInt64BE(BigInt(index), 4); return n; };
const aadFor = (header, final) => Buffer.concat([header, Buffer.from([final ? 1 : 0])]);

function encryptChunk(key, header, index, plain, final) {
  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonceFor(index), { authTagLength: TAG });
  cipher.setAAD(aadFor(header, final), { plaintextLength: plain.length });
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length); return Buffer.concat([len, body]);
}
function decryptChunk(key, header, index, body, final) {
  const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonceFor(index), { authTagLength: TAG });
  decipher.setAAD(aadFor(header, final), { plaintextLength: body.length - TAG }); decipher.setAuthTag(body.subarray(body.length - TAG));
  try { return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG)), decipher.final()]); } catch { return null; }
}

/** Transform: plaintext in, VSYNC1 stream out, sealed to `recipientPublic` (32-byte Buffer or 64 hex). `ephemeral` is for test vectors only. */
export function sealStream(recipientPublic, { ephemeral = generateKeyPair() } = {}) {
  const recipient = hexKey(recipientPublic, 'recipient key'); const header = Buffer.concat([MAGIC, ephemeral.public]);
  const key = sessionKey(ephemeral.secret, recipient, ephemeral.public, recipient);
  let pending = Buffer.alloc(0), index = 0, started = false;
  const begin = stream => { if (!started) { started = true; stream.push(header); } };
  return new Transform({
    transform(data, _enc, done) {
      try {
        begin(this); pending = pending.length ? Buffer.concat([pending, data]) : data;
        // Hold back the last chunk until more data (or the end) shows whether it is final.
        while (pending.length > CHUNK) { this.push(encryptChunk(key, header, index++, pending.subarray(0, CHUNK), false)); pending = pending.subarray(CHUNK); }
        done();
      } catch (e) { done(e); }
    },
    flush(done) { try { begin(this); this.push(encryptChunk(key, header, index++, pending, true)); done(); } catch (e) { done(e); } },
  });
}

/** Transform: VSYNC1 stream in, plaintext out. Rejects bad magic, oversize chunks, a missing final chunk, trailing bytes and any bad tag. */
export function openStream(secretKey) {
  const secret = hexKey(secretKey, 'secret key');
  let buf = Buffer.alloc(0), header = null, key = null, index = 0, finished = false;
  const fail = message => Object.assign(Error(message), { code: 'VSYNC_REJECT' });
  const drain = stream => {
    for (;;) {
      if (!header) {
        if (buf.length < MAGIC.length) return; if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw fail('wrong magic');
        if (buf.length < HEADER) return;
        header = Buffer.from(buf.subarray(0, HEADER)); buf = buf.subarray(HEADER);
        key = sessionKey(secret, header.subarray(MAGIC.length), header.subarray(MAGIC.length), publicFromSecret(secret));
      }
      if (finished) { if (buf.length) throw fail('trailing bytes after the final chunk'); return; }
      if (buf.length < 4) return;
      const size = buf.readUInt32BE(0);
      if (size > CHUNK + TAG || size < TAG) throw fail('bad chunk length');
      if (buf.length < 4 + size) return;
      const body = buf.subarray(4, 4 + size); buf = buf.subarray(4 + size);
      let plain = decryptChunk(key, header, index, body, false);
      // `chunk` 0 failing on a hash-checked upload means it was sealed for another key (the VM's was replaced).
      if (!plain) { plain = decryptChunk(key, header, index, body, true); if (!plain) throw Object.assign(fail('authentication failed'), { chunk: index }); finished = true; }
      index++; if (plain.length) stream.push(plain);
    }
  };
  return new Transform({
    transform(data, _enc, done) { try { buf = buf.length ? Buffer.concat([buf, data]) : data; drain(this); done(); } catch (e) { done(e); } },
    flush(done) { try { drain(this); if (!header || !finished) throw fail('missing final chunk'); done(); } catch (e) { done(e); } },
  });
}

/** Whole-buffer helpers, for small payloads and tests. */
export const sealBuffer = (recipientPublic, data, opts) => new Promise((resolve, reject) => { const s = sealStream(recipientPublic, opts), out = []; s.on('data', c => out.push(c)).on('end', () => resolve(Buffer.concat(out))).on('error', reject); s.end(data); });
export const openBuffer = (secret, data) => new Promise((resolve, reject) => { const s = openStream(secret), out = []; s.on('data', c => out.push(c)).on('end', () => resolve(Buffer.concat(out))).on('error', reject); s.end(data); });
