import assert from 'node:assert/strict';
import test from 'node:test';
import { createUpgradePolicy } from '../src/upgradePolicy.mjs';
import { running, open } from './securityHarness.mjs';

test('upgrade policy accepts native peers and configured exact origins only', () => {
  const check = createUpgradePolicy({ path: '/agent', origins: ['https://app.vibyra.test', 'http://localhost'] });
  const request = (origin, url = '/agent') => ({ method: 'GET', url, headers: { origin }, rawHeaders: [] });
  assert.equal(check(request(undefined)), null);
  assert.equal(check(request('https://app.vibyra.test')), null);
  assert.equal(check(request('http://localhost')), null);
  for (const origin of ['https://app.vibyra.test.evil.test', 'https://evil.test', 'null', 'https://app.vibyra.test/', 'https://app.vibyra.test, https://evil.test'])
    assert.equal(check(request(origin)), 403);
  for (const url of ['/agent?token=secret', '/agent/', '/admin/disconnect', '//agent', '/%61gent'])
    assert.equal(check(request(undefined, url)), 404);
  assert.equal(check({ ...request(undefined), method: 'POST' }), 404);
  assert.equal(check({ ...request('https://app.vibyra.test'), rawHeaders: ['Origin', 'https://app.vibyra.test', 'Origin', 'https://evil.test'] }), 403);
  assert.equal(check({ ...request('https://evil.test'), headers: { origin: 'https://evil.test', host: 'app.vibyra.test', 'x-forwarded-host': 'app.vibyra.test' } }), 403);
});

test('invalid origin/path configuration fails closed and opaque origin requires explicit opt-in', () => {
  for (const origins of ['*', ['*'], ['https://example.test/path'], ['https://user:secret@example.test'], ['https://example.test?x=1']])
    assert.throws(() => createUpgradePolicy({ origins }), /origins/);
  assert.throws(() => createUpgradePolicy({ path: '/?token=secret' }), /path/);
  assert.equal(createUpgradePolicy({ origins: ['null'] })({ method: 'GET', url: '/', headers: { origin: 'null' } }), null);
});

test('actual HTTP upgrades reject wrong path, query credentials and hostile origins', async () => {
  const relay = await running({ VIBYRA_RELAY_ALLOWED_ORIGINS: '["https://app.vibyra.test"]' });
  try {
    await assert.rejects(open(`${relay.url}/admin/disconnect`), /404/);
    await assert.rejects(open(`${relay.url}/?token=secret`), /404/);
    await assert.rejects(open(relay.url, { origin: 'https://evil.test' }), /403/);
    await assert.rejects(open(relay.url, { origin: 'null' }), /403/);
    for (const origin of [undefined, 'https://app.vibyra.test']) {
      const peer = await open(relay.url, origin ? { origin } : undefined);
      peer.socket.close(); await peer.closed;
    }
  } finally { relay.close(); }
});
