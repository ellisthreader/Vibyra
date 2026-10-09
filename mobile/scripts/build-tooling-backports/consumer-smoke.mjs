import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'));
const mm = require('micromatch');
assert.deepEqual(mm.braceExpand('src/{one,two}/{01..02}.ts'), ['src/one/01.ts', 'src/one/02.ts', 'src/two/01.ts', 'src/two/02.ts']);
assert.ok(mm.parse('src/{one,two}/*.ts').length);
assert.throws(() => mm.braces('{'.repeat(140) + 'x' + '}'.repeat(140)), /security limit/);
const metroPackage = path.dirname(require.resolve('metro-file-map/package.json'));
const { includedByGlob } = require(path.join(metroPackage, 'src/watchers/common.js'));
assert.equal(includedByGlob('f', ['src/{one,two}/*.ts'], false, 'src/one/index.ts'), true);
assert.equal(includedByGlob('f', ['src/{one,two}/*.ts'], false, 'src/three/index.ts'), false);
const certs = require('@expo/code-signing-certificates');
const keyPair = certs.generateKeyPair();
const certificate = certs.generateSelfSignedCodeSigningCertificate({
  keyPair, commonName: 'Vibyra ephemeral compatibility fixture',
  validityNotBefore: new Date(Date.now() - 60000),
  validityNotAfter: new Date(Date.now() + 3600000)
});
certs.validateSelfSignedCertificate(certificate, keyPair);
const signature = certs.signBufferRSASHA256AndVerify(keyPair.privateKey, certificate, Buffer.from('ephemeral fixture'));
assert.ok(Buffer.from(signature, 'base64').length >= 256);
console.log('Actual micromatch, Metro filter, and Expo code-signing consumers passed.');
