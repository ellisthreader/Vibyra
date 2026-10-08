// Strict reader for the login artifact (docs/cloud-sync-contract.md "Logins"): a ustar archive with exactly ONE regular
// entry (`codex/auth.json` or `claude/oauth-token`) of at most 64 KiB. Anything else (more entries, links, directories, PAX/GNU headers, other names,
// path tricks, a bad checksum, junk after the end blocks) is refused. Works on a Buffer and never reports content in errors.
export const AUTH_NAME = 'codex/auth.json';
export const CLAUDE_TOKEN_NAME = 'claude/oauth-token';
export const MAX_AUTH_BYTES = 64 * 1024;
const BLOCK = 512;

const bad = () => Object.assign(Error('invalid login archive'), { syncCode: 'invalid_login_archive' });
const text = (buf, from, to) => { const z = buf.indexOf(0, from); return buf.toString('latin1', from, z >= 0 && z < to ? z : to); };

/** @returns {Buffer} the bytes of the one expected entry `name`. Throws a generic error for anything unexpected. */
export function readLoginTar(tar, name = AUTH_NAME) {
  if (!Buffer.isBuffer(tar) || tar.length < BLOCK * 4 || tar.length > 256 * 1024 + BLOCK * 4) throw bad();
  const head = tar.subarray(0, BLOCK);
  if (text(head, 0, 100) !== name) throw bad();
  if (!head.subarray(Buffer.byteLength(name), 100).every(b => b === 0)) throw bad();
  if (!head.subarray(345, 500).every(b => b === 0)) throw bad(); // a ustar prefix would make a different path
  if (!head.subarray(157, 257).every(b => b === 0)) throw bad(); // link name
  if (head[156] !== 0x30 && head[156] !== 0) throw bad(); // regular file only
  const sizeField = text(head, 124, 136).trim(); if (!/^[0-7]{1,11}$/.test(sizeField)) throw bad();
  const size = parseInt(sizeField, 8); if (size < 2 || size > MAX_AUTH_BYTES) throw bad();
  const sum = text(head, 148, 156).trim(); if (!/^[0-7]{1,7}$/.test(sum)) throw bad();
  let total = 0; for (let i = 0; i < BLOCK; i++) total += i >= 148 && i < 156 ? 0x20 : head[i];
  if (total !== parseInt(sum, 8)) throw bad();
  const end = BLOCK + size; const padded = BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  if (tar.length < padded + BLOCK * 2) throw bad();
  if (!tar.subarray(end, tar.length).every(b => b === 0)) throw bad(); // padding and end blocks only: a second entry is refused here
  return Buffer.from(tar.subarray(BLOCK, end));
}
