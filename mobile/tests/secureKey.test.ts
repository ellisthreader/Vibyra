import assert from 'node:assert/strict';
import { test } from 'node:test';

// The pure escaper is duplicated here rather than imported: the module pulls in
// expo-secure-store, which has no Node build.
const secureKey = (key: string): string =>
  key.replace(/[^A-Za-z0-9.-]/g, char => `_${char.codePointAt(0)!.toString(16)}`);
const allowed = /^[A-Za-z0-9._-]+$/;

test('a clean key is left alone', () => {
  assert.equal(secureKey('vibyra.remote.v1.flag.onboarding'), 'vibyra.remote.v1.flag.onboarding');
});

test('an account email becomes a key SecureStore accepts', () => {
  const key = secureKey('vibyra.remote.v1.flag.vibes.ellis.threader3001%40gmail.com');
  assert.match(key, allowed);
  assert.equal(key, 'vibyra.remote.v1.flag.vibes.ellis.threader3001_2540gmail.com');
});

test('escaping is injective: underscores and specials never collide', () => {
  const keys = ['a_b', 'a%b', 'a@b', 'a_25b', 'a b'].map(secureKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, allowed);
});
