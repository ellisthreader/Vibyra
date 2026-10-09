import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../package.json'));
const braces = require('braces');
for (const api of ['parse', 'compile', 'expand', 'stringify']) {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    assert.throws(() => braces[api](open.repeat(3500) + 'x' + close.repeat(3500)), SyntaxError);
  }
}
for (const api of ['compile', 'expand', 'stringify']) {
  const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle);
  assert.throws(() => braces[api](cycle), /Cyclic brace AST/);
  const parentCycle = { type: 'root', nodes: [] }; parentCycle.parent = parentCycle;
  assert.throws(() => braces[api](parentCycle), /Cyclic brace AST parent/);
  let deep = { type: 'text', value: 'x' };
  for (let i = 0; i < 140; i++) deep = { type: 'root', nodes: [deep] };
  assert.throws(() => braces[api](deep), /security limit/);
  for (const invalid of [null, [], { type: 'root', nodes: 'bad' }, { type: 'text', value: [] }]) {
    assert.throws(() => braces[api](invalid), TypeError);
  }
}
const flatten = require('braces/lib/utils').flatten;
const array = []; array.push(array);
assert.throws(() => flatten(array), /security limit/);
for (const api of ['compile', 'expand', 'stringify']) {
  const shared = { type: 'text', value: 'x' };
  const dag = { type: 'root', nodes: [shared, shared] }; shared.parent = dag;
  assert.deepEqual(braces[api](dag), api === 'expand' ? ['xx'] : 'xx');
  const accessor = { type: 'root', get nodes() { throw Error('must not execute'); } };
  assert.throws(() => braces[api](accessor), /Invalid brace AST accessor/);
}
assert.throws(() => braces.parse('('.repeat(140), { maxDepth: Infinity }), /security limit/);
assert.deepEqual(braces.expand('src/{a,b}/{1..3}.js'), ['src/a/1.js', 'src/a/2.js', 'src/a/3.js', 'src/b/1.js', 'src/b/2.js', 'src/b/3.js']);
assert.equal(braces.stringify(braces.parse('{'.repeat(126) + 'x' + '}'.repeat(126))), '{'.repeat(126) + 'x' + '}'.repeat(126));
assert.deepEqual(braces.expand('\\{literal\\}'), ['{literal}']);
assert.deepEqual(braces.expand('{01..03}'), ['01', '02', '03']);
// Isolated bounded processes test real crypto implementations, including both
// published browser bundles. An invalid signature must never verify successfully.
const vector = JSON.parse(fs.readFileSync(path.join(here, 'forge-vector.json')));
for (const entry of ['lib/index.js', 'dist/forge.min.js', 'dist/forge.all.min.js']) {
  const script = `try {global.self=global;global.window=global;global.jQuery=null; const assert=require('node:assert/strict');
    const forge=require(${JSON.stringify(require.resolve('node-forge/' + entry))});
    const v=${JSON.stringify(vector)};
    const key=forge.pki.rsa.setPublicKey(new forge.jsbn.BigInteger(v.publicModulus,16),new forge.jsbn.BigInteger('3'));
    const md=forge.md.sha256.create();md.update(v.message);
    assert.throws(()=>key.verify(md.digest().getBytes(),forge.util.hexToBytes(v.signature)),/valid RSASSA/);
    forge.options.usePureJavaScript=true;forge.random.seedFileSync=n=>require('node:crypto').randomBytes(n).toString('binary');
    const keys=forge.pki.rsa.generateKeyPair({bits:1024,e:65537});
    for(const name of ['sha256','sha512']){const d=forge.md[name].create();d.update('legitimate fixture');const sig=keys.privateKey.sign(d);assert.equal(keys.publicKey.verify(d.digest().getBytes(),sig),true);}
    const d=forge.md.sha256.create();d.update('pss fixture');const p=forge.pss.create({md:forge.md.sha256.create(),mgf:forge.mgf.mgf1.create(forge.md.sha256.create()),saltLength:20});const sig=keys.privateKey.sign(d,p);assert.equal(keys.publicKey.verify(d.digest().getBytes(),sig,p),true);}catch(error){console.error(error.message);process.exitCode=1;}`;
  const result = spawnSync(process.execPath, ['-e', script], { timeout: 20000, encoding: 'utf8' });
  assert.equal(result.status, 0, entry + ': ' + (result.error?.message || result.stderr.slice(-1500)));
}
console.log('Build-tooling adversarial and valid-vector regressions passed.');
