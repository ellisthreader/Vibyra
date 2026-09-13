import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDesktopVersion, verifySignature } from './verify-release.mjs';

const [arch, target] = process.argv.slice(2);
if (!['arm64', 'x64'].includes(arch) || target !== (arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin')) {
  throw new Error('Expected matching Mac architecture and Rust target');
}
const version = readDesktopVersion();
const bundle = resolve(`src-tauri/target/${target}/release/bundle`);
const output = resolve('release-macos');
mkdirSync(output, { recursive: true });
const metadata = { version, architecture: arch, minimumSystemVersion: '12.0',
  sourceSha: process.env.GITHUB_SHA ?? '', notarized: process.env.VIBYRA_MAC_VALIDATION !== 'true' };
for (const [kind, folder, suffix] of [['installer', 'dmg', '.dmg'], ['updater', 'macos', '.app.tar.gz']]) {
  const matches = readdirSync(`${bundle}/${folder}`).filter(name => name.endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Expected one ${kind}, found ${matches.length}`);
  const source = `${bundle}/${folder}/${matches[0]}`;
  const bytes = readFileSync(source);
  if (!bytes.length) throw new Error(`${kind} is empty`);
  const filename = `Vibyra-Desktop-${version}-${arch}${suffix}`;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const record = { filename, sizeBytes: bytes.length, sha256 };
  if (kind === 'updater') {
    record.signature = readFileSync(`${source}.sig`, 'utf8').trim();
    verifySignature(record.signature, createHash('blake2b512').update(bytes).digest(), filename);
    writeFileSync(`${output}/${filename}.sig`, `${record.signature}\n`);
  }
  copyFileSync(source, `${output}/${filename}`);
  writeFileSync(`${output}/${filename}.sha256`, `${sha256}  ${filename}\n`);
  metadata[kind] = record;
}
writeFileSync(`${output}/${arch}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Verified ${arch} installer and updater; notarized=${metadata.notarized}`);
