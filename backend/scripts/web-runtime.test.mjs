import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, statSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, userInfo } from 'node:os';
import { serviceIdentity, prepareRuntime, verifyApplicationWrites } from './web-runtime.mjs';

test('runtime ownership and write probe use the actual service account', { skip: process.getuid?.() === 0 }, () => {
  const identity = serviceIdentity({});
  assert.equal(identity.uid, process.getuid());
  assert.equal(identity.user, userInfo().username);
  const root = mkdtempSync(join(tmpdir(), 'vibyra-runtime-test-'));
  try {
    prepareRuntime(root, identity);
    assert.equal(statSync(join(root, 'body')).uid, identity.uid);
    assert.equal(statSync(join(root, 'body')).mode & 0o777, 0o700);
    for (const path of ['storage/framework', 'storage/logs', 'bootstrap/cache']) mkdirSync(join(root, path), { recursive: true });
    verifyApplicationWrites(root, identity);
    const readonly = join(root, 'storage/logs/laravel.log');
    writeFileSync(readonly, 'existing log'); chmodSync(readonly, 0o400);
    assert.throws(() => verifyApplicationWrites(root, identity), /cannot write runtime files/);
    chmodSync(readonly, 0o600);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('service identity rejects root and command-shaped names', () => {
  assert.throws(() => serviceIdentity({ VIBYRA_FPM_USER: 'root' }), /Invalid non-root|Set VIBYRA_FPM_USER/);
  assert.throws(() => serviceIdentity({ VIBYRA_FPM_USER: 'x;id', VIBYRA_FPM_GROUP: 'bad' }), /Invalid service user/);
});
