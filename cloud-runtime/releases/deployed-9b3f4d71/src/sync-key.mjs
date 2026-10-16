import fs from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPair, publicFromSecret } from './sync-crypto.mjs';

/**
 * The VM's X25519 pair lives in <syncDir>/key (64 hex chars, mode 0400, owned by uid 1001) and never leaves the VM; only the
 * public half is published. This runs inside the uid-1001 worker: the directory is prepared by root with ensureOwnedDir, but
 * root never writes in it. A volume reset removes the key, a new pair is made and publishing it makes the backend ask for resyncs.
 */
export async function ensureKey(syncDir) {
  const file = path.join(syncDir, 'key');
  await fs.mkdir(syncDir, { recursive: true, mode: 0o700 }); await fs.chmod(syncDir, 0o700).catch(() => {});
  const st = await fs.lstat(file).catch(() => null);
  if (st?.isFile()) {
    const hex = (await fs.readFile(file, 'utf8')).trim();
    if (/^[0-9a-f]{64}$/.test(hex)) { if ((st.mode & 0o777) !== 0o400) await fs.chmod(file, 0o400); return { secretHex: hex, publicHex: publicFromSecret(hex).toString('hex') }; }
  }
  const pair = generateKeyPair(); const tmp = `${file}.${process.pid}.new`;
  await fs.rm(tmp, { force: true }); await fs.writeFile(tmp, `${pair.secret.toString('hex')}\n`, { flag: 'wx', mode: 0o400 });
  await fs.rename(tmp, file); // replaces a symlink or junk entry itself, never follows it
  return { secretHex: pair.secret.toString('hex'), publicHex: pair.public.toString('hex') };
}
/** Publishes the public key (idempotent on the backend). */
export const publishKey = (client, key) => client.publishKey(key.publicHex);
