import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifyUpdateSignature } from './minisign-verify.mjs';

const dir = process.argv[2];
const manifest = JSON.parse(readFileSync(join(dir, 'notarized-manifest.json')));
const source = process.env.NOTARIZED_SOURCE_COMMIT;
if (!/^[a-f0-9]{40}$/.test(source ?? '') || manifest.sourceCommit !== source) throw new Error('Wrong frozen source');
const config = JSON.parse(execFileSync('git', ['show', `${source}:desktop-tauri/src-tauri/tauri.conf.json`], { encoding: 'utf8' }));
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
