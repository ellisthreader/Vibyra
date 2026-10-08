#!/usr/bin/env node
// Synthetic detector fixtures are constructed locally; no issued credentials belong here.
import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const expected = '0a6023246fbfffd9edc4741da42455fe462e2827ebc5a2667053f3843e8d22b3';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const regular = async path => {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Fixture input must be a regular file.');
};
const piece = part => {
  if (Object.keys(part).length === 1 && typeof part.literal === 'string') return part.literal;
  if (Object.keys(part).length === 2 && typeof part.repeat === 'string'
      && Number.isInteger(part.count) && part.count >= 1 && part.count <= 65536) {
    return part.repeat.repeat(part.count);
  }
  throw new Error('Invalid deterministic fixture expression.');
};

async function materialize(checkOnly) {
  const template = resolve(root, 'docs/secret-guard-vectors.template.json');
  const factories = resolve(root, 'docs/secret-guard-fixture-factories.json');
  await regular(template); await regular(factories);
  const spec = JSON.parse(await readFile(factories, 'utf8'));
  if (spec.version !== 1 || spec.materializedSha256 !== expected) throw new Error('Fixture corpus version mismatch.');
  let result = await readFile(template, 'utf8');
  for (const [name, factory] of Object.entries(spec.factories)) {
    if (!/^[a-z_]+_[0-9]{3}$/.test(name) || !Array.isArray(factory.parts)) throw new Error('Invalid fixture factory.');
    const marker = `@@VIBYRA_TEST_FIXTURE:${name}@@`;
    if (!result.includes(marker)) throw new Error('Unused fixture factory.');
    const value = factory.parts.map(piece).join('');
    result = result.split(marker).join(JSON.stringify(value).slice(1, -1));
  }
  if (result.includes('@@VIBYRA_TEST_FIXTURE:') || hash(result) !== expected) {
    throw new Error('Materialized fixture checksum mismatch; no file was written.');
  }
  JSON.parse(result);
  if (checkOnly) return;
  const target = resolve(root, 'docs/secret-guard-vectors.json');
  let existing;
  try { await regular(target); existing = await readFile(target); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (hash(existing) !== expected) throw new Error('Existing fixture differs; refusing to overwrite it.');
    return;
  }
  const temporary = `${target}.fixture-${randomUUID()}`;
  try { await writeFile(temporary, result, { flag: 'wx', mode: 0o644 }); await rename(temporary, target); }
  finally { await unlink(temporary).catch(() => {}); }
}

const args = process.argv.slice(2);
try {
  if (args.length && args[0] !== '--' && args[0] !== '--check') throw new Error('Use --check or -- followed by a build/test command.');
  if (args[0] === '--check' && args.length !== 1) throw new Error('--check takes no command.');
  await materialize(args[0] === '--check');
  console.log(`Synthetic fixture corpus verified: sha256:${expected}`);
  if (args[0] === '--') {
    if (!args[1]) throw new Error('A build/test command is required after --.');
    const result = spawnSync(args[1], args.slice(2), { cwd: root, stdio: 'inherit' });
    if (result.error) throw new Error('Build/test command could not start.');
    process.exitCode = result.status ?? 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
