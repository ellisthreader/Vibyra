import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyUpdateSignature } from './minisign-verify.mjs';

const dir = process.argv[2];
const manifest = JSON.parse(readFileSync(join(dir, 'notarized-manifest.json')));
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json'));
const archives = readdirSync(dir).filter((file) => file.endsWith('.app.tar.gz'));
if (archives.length !== 2) throw new Error('Exactly two architecture archives required');
for (const entry of manifest.archives) {
  const data = readFileSync(join(dir, entry.filename));
  if (data.length !== entry.sizeBytes || createHash('sha256').update(data).digest('hex') !== entry.sha256) {
    throw new Error('Notarized archive bytes changed');
  }
  verifyUpdateSignature(data, readFileSync(join(dir, `${entry.filename}.sig`), 'utf8'), config.plugins.updater.pubkey);
}
console.log('Both notarized archives retain their hashes and verify with the installed updater key');
