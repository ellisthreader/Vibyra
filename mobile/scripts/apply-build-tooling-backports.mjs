import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Unsupported argument');
const specs = JSON.parse(fs.readFileSync(path.join(here, 'build-tooling-backports/patches.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const provenance = JSON.parse(fs.readFileSync(path.join(here, 'build-tooling-backports/provenance.json'), 'utf8'));
const versions = Object.fromEntries(Object.entries(provenance.packages).map(([name, item]) => [name, item.version]));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function regular(target, optional = false) {
  let current = root;
  for (const component of path.relative(root, target).split(path.sep)) {
    if (component === '..') throw new Error('Package path escapes mobile root');
    current = path.join(current, component);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error('Symlink refused: ' + current);
      if (current === target && !stat.isFile()) throw new Error('Expected regular file: ' + current);
    } catch (error) {
      if (optional && current === target && error.code === 'ENOENT') return false;
      throw error;
    }
  }
  return true;
}
const pending = [];
for (const [name, version] of Object.entries(versions)) {
  const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith('node_modules/' + name));
  if (!entries.length) throw new Error('Missing locked package: ' + name);
  for (const [relative, metadata] of entries) {
    if (metadata.version !== version || metadata.integrity !== provenance.packages[name].integrity ||
        metadata.resolved !== provenance.packages[name].resolved) {
      throw new Error('Unsupported locked package: ' + name);
    }
    const directory = path.resolve(root, relative);
    if (!directory.startsWith(root + path.sep)) throw new Error('Package path escapes mobile root');
    const manifest = path.join(directory, 'package.json');
    regular(manifest);
    const installed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (installed.name !== name || installed.version !== version) throw new Error('Installed package mismatch');
    for (const spec of specs.filter(item => item.package === name)) {
      const target = path.join(directory, spec.path);
      const exists = regular(target, spec.beforeSha256 === null);
      const source = exists ? fs.readFileSync(target, 'utf8') : null;
      if (source !== null && sha(source) === spec.afterSha256) continue;
      if ((source === null ? null : sha(source)) !== spec.beforeSha256) {
        throw new Error('Backport source checksum mismatch: ' + name + '/' + spec.path);
      }
      let patched = spec.newSource ?? source;
      for (const [before, after] of spec.replacements) {
        if (patched.split(before).length !== 2) throw new Error('Backport replacement is not unique');
        patched = patched.replace(before, after);
      }
      if (sha(patched) !== spec.afterSha256) throw new Error('Backport output checksum mismatch');
      pending.push([target, patched]);
    }
  }
}
// Validate every package/file before modifying any input. A failed interrupted run
// may be retried: only exact upstream and exact patched bytes are ever accepted.
if (check && pending.length) throw new Error('Build tooling backports are not applied');
if (!check) for (const [target, patched] of pending) fs.writeFileSync(target, patched);
console.log(`Build tooling backports verified (${pending.length} files ${check ? 'pending' : 'applied'}).`);
