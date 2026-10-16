import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerifier, signToken } from '../src/tokens.mjs';
const current = 'current-signing-test-secret-0123456789';
const previous = 'previous-signing-test-secret-0123456789';
const claims = { role: 'host', hostId: 'host', userId: 'user', exp: 5000 };
test('signing rotation accepts bounded previous key and refuses expired overlap or unknown kid', () => {
  let time = 1000000;
  const verify = createVerifier({ secret: current, signingKeyId: 'new', signingPreviousSecret: previous,
    signingPreviousKeyId: 'old', signingPreviousUntil: 1100, now: () => time });
  assert.ok(verify('host', 'host', signToken(current, { ...claims, kid: 'new' })));
  assert.ok(verify('host', 'host', signToken(previous, { ...claims, kid: 'old' })));
  assert.ok(verify('host', 'host', signToken(previous, claims)), 'legacy previous v1 during overlap');
  assert.equal(verify('host', 'host', signToken(current, { ...claims, kid: 'unknown' })), null);
  assert.equal(verify('host', 'host', signToken(previous, { ...claims, kid: 'new' })), null);
  time = 1100000;
  assert.equal(verify('host', 'host', signToken(previous, { ...claims, kid: 'old' })), null);
  assert.ok(verify('host', 'host', signToken(current, { ...claims, kid: 'new' })));
});
test('previous signing secret without explicit overlap expiry fails startup', () => {
  assert.throws(() => createVerifier({ secret: current, signingPreviousSecret: previous }), /bounded overlap/);
});
