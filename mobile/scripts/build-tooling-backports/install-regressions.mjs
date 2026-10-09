import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '../..');
const specs = JSON.parse(fs.readFileSync(path.join(here, 'patches.json')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibyra-backport-install-'));
const copied = path.join(temp, 'mobile');
fs.mkdirSync(path.join(copied, 'node_modules'), { recursive: true });
fs.cpSync(path.join(mobile, 'scripts'), path.join(copied, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(mobile, 'package-lock.json'), path.join(copied, 'package-lock.json'));
for (const name of ['braces', 'node-forge']) {
  fs.cpSync(path.join(mobile, 'node_modules', name), path.join(copied, 'node_modules', name), { recursive: true });
}
const target = spec => path.join(copied, 'node_modules', spec.package, spec.path);
function restoreUpstream() {
  for (const spec of specs) {
    if (spec.beforeSha256 === null) { fs.rmSync(target(spec), { force: true }); continue; }
    let source = fs.readFileSync(path.join(mobile, 'node_modules', spec.package, spec.path), 'utf8');
    for (const [before, after] of [...spec.replacements].reverse()) source = source.replace(after, before);
    fs.writeFileSync(target(spec), source);
  }
}
const run = (...args) => spawnSync(process.execPath, [path.join(copied, 'scripts/apply-build-tooling-backports.mjs'), ...args], { timeout: 5000, encoding: 'utf8' });
try {
  restoreUpstream();
  const baseline = specs.filter(s => s.beforeSha256).map(s => [target(s), fs.readFileSync(target(s))]);
  const victim = target(specs.find(s => s.package === 'node-forge'));
  fs.appendFileSync(victim, '\n// unexpected bytes\n');
  assert.notEqual(run().status, 0);
  for (const [name, bytes] of baseline) if (name !== victim) assert.deepEqual(fs.readFileSync(name), bytes);
  assert.equal(fs.existsSync(target(specs[0])), false);
  restoreUpstream();
  const lockPath = path.join(copied, 'package-lock.json');
  const originalLock = fs.readFileSync(lockPath);
  const lock = JSON.parse(originalLock);
  lock.packages['node_modules/braces'].version = '3.0.4';
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  assert.notEqual(run().status, 0);
  assert.equal(fs.existsSync(target(specs[0])), false);
  fs.writeFileSync(lockPath, originalLock);
  assert.equal(run('--check').status, 1);
  assert.equal(run().status, 0);
  assert.equal(run().status, 0);
  assert.equal(run('--check').status, 0);
  fs.unlinkSync(target(specs[0]));
  assert.notEqual(run('--check').status, 0);
  assert.equal(run().status, 0);
  const link = path.join(copied, 'node_modules/braces/lib/compile.js');
  const real = link + '.real'; fs.renameSync(link, real); fs.symlinkSync(real, link);
  assert.notEqual(run().status, 0);
  fs.unlinkSync(link); fs.renameSync(real, link);
  restoreUpstream();
  const old = spawnSync(process.execPath, ['--stack-size=256', '-e', `try { require(${JSON.stringify(path.join(copied, 'node_modules/braces'))}).compile('('.repeat(4000)+'x'+')'.repeat(4000)); process.exitCode=2; } catch(e) { if(e instanceof RangeError && /call stack/.test(e.message)) console.log('upstream stack overflow reproduced'); else throw e; }`], { timeout: 5000, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(mobile, 'node_modules') } });
  assert.equal(old.status, 0, old.stderr);
  const vector = JSON.parse(fs.readFileSync(path.join(here, 'forge-vector.json')));
  for (const entry of ['lib/index.js', 'dist/forge.min.js', 'dist/forge.all.min.js']) {
    const script = `try { global.window=global;global.self=global;global.jQuery=null;const f=require(${JSON.stringify(path.join(copied, 'node_modules/node-forge', entry))}),v=${JSON.stringify(vector)};const k=f.pki.rsa.setPublicKey(new f.jsbn.BigInteger(v.publicModulus,16),new f.jsbn.BigInteger('3'));const m=f.md.sha256.create();m.update(v.message);if(k.verify(m.digest().getBytes(),f.util.hexToBytes(v.signature))!==true)throw Error('old vector did not reproduce'); }catch(e){console.error(e.message);process.exitCode=1;}`;
    const result = spawnSync(process.execPath, ['-e', script], { timeout: 5000, encoding: 'utf8' });
    assert.equal(result.status, 0, entry + result.stderr.slice(-500));
  }
  console.log('Installer fail-closed, idempotence, and fail-old regressions passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
