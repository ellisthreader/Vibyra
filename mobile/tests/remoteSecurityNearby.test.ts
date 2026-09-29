import assert from 'node:assert/strict';
import test from 'node:test';
import { delay, pairing } from './runtimeHarness';
import { CLIENT, connected, DEVICE, HOST, invoke } from './remoteSecurityHarness';
import type { RemoteDevice } from '../src/remote/securityTypes';

const device = (): RemoteDevice => ({ id: DEVICE, hostId: HOST, publicKey: CLIENT, deviceName: 'Phone',
  pairingCode: '123456', approvedAt: '2026-09-29', deniedAt: null, revokedAt: null, requestExpiresAt: null, permissions: [] });

test('account-wide revocation closes an owned nearby connection before API I/O, even when the API fails', async () => {
  for (const action of ['disable', 'revokeAll', 'removePasskey'] as const) {
    const h = await connected(false);
    try {
      await h.store.actions.listComputers!();
      const pending = invoke(h.api, action); const rejected = assert.rejects(pending, /This phone disconnected.*unconfirmed/);
      assert.equal(h.store.state.status, 'offline', action);
      assert.equal(h.store.saved?.autoConnect, false);
      assert.deepEqual(h.calls, [], 'local close precedes the server request');
      await assert.rejects(h.rpc.request('host.state'), /Connect to your computer/);
      await delay(); h.fail(); await rejected;
      const opened = h.sent.filter(message => message.type === 'open').length;
      h.store.resume(); await delay(15);
      assert.equal(h.sent.filter(message => message.type === 'open').length, opened);
      assert.equal(JSON.parse(h.memory.get('connection')!).autoConnect, false);
    } finally { h.store.dispose(); }
  }
});

test('cloud session and device actions preserve nearby transport even on an owned desktop', async () => {
  for (const action of ['disconnect', 'disconnectAll', 'revoke'] as const) {
    const h = await connected(false);
    try {
      await h.store.actions.listComputers!();
      const pending = invoke(h.api, action); await delay(); h.complete(); await pending;
      assert.equal(h.store.state.status, 'connected');
      assert.equal((await h.rpc.request('host.state')).host.id, HOST);
    } finally { h.store.dispose(); }
  }
});

test('unavailable, malformed, foreign-account, and previous-connection ownership lists never close nearby work', async () => {
  for (const condition of ['unavailable', 'malformed', 'foreign', 'previous-connection', 'other-host'] as const) {
    const h = await connected(false);
    try {
      await h.store.actions.listComputers!();
      if (condition === 'unavailable') {
        h.remote.computers = async () => { throw new Error('offline'); };
        await assert.rejects(h.store.actions.listComputers!());
      } else if (condition === 'malformed') {
        h.remote.computers = async () => ({ computers: [{ id: HOST }, null] }) as any;
        await h.store.actions.listComputers!();
      } else if (condition === 'foreign') h.store.token = 'another-account';
      else if (condition === 'previous-connection') await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST }));
      else {
        h.remote.computers = async () => ({ live: true, entitled: true, computers: [] });
        await h.store.actions.listComputers!();
      }
      const pending = h.api.disable(); await delay(); h.complete(); await pending;
      assert.equal(h.store.state.status, 'connected', condition);
      assert.equal(h.store.saved?.autoConnect, true);
    } finally { h.store.dispose(); }
  }
});

test('an ownership response arriving after account or connection replacement cannot authorize teardown', async () => {
  for (const boundary of ['account', 'connection'] as const) {
    const h = await connected(false);
    try {
      const result = await h.remote.computers();
      let complete!: () => void;
      h.remote.computers = async () => { await new Promise<void>(resolve => { complete = resolve; }); return result; };
      const listing = h.store.actions.listComputers!();
      if (boundary === 'account') h.store.token = 'another-account';
      else await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST }));
      complete(); await listing;
      assert.equal(h.store.ownedRemoteHosts, null);
      const pending = h.api.disable(); await delay(); h.complete(); await pending;
      assert.equal(h.store.state.status, 'connected');
    } finally { h.store.dispose(); }
  }
});

test('device revocation immediately closes nearby only with owned host and exact authenticated Noise key', async () => {
  const h = await connected(false);
  try {
    h.remote.dashboard!.devices = async () => [device()];
    await h.store.actions.listComputers!(); await h.api.devices();
    const pending = h.api.revoke(DEVICE); const rejected = assert.rejects(pending, /This phone disconnected.*unconfirmed/);
    assert.equal(h.store.state.status, 'offline');
    assert.equal(h.store.saved?.autoConnect, false);
    assert.deepEqual(h.calls, []);
    await delay(); h.fail(); await rejected;
  } finally { h.store.dispose(); }
});

test('device key mismatch, missing identity, unowned host, and stale account/connection/list preserve nearby control', async () => {
  for (const condition of ['key', 'identity', 'host', 'account', 'connection', 'unavailable', 'malformed'] as const) {
    const h = await connected(false);
    try {
      h.remote.dashboard!.devices = async () => [{ ...device(), ...(condition === 'key' ? { publicKey: 'ed'.repeat(32) } : {}) }];
      if (condition !== 'host') await h.store.actions.listComputers!();
      await h.api.devices();
      if (condition === 'identity') h.store.saved!.deviceId = undefined;
      if (condition === 'account') h.store.token = 'another-account';
      if (condition === 'connection') {
        await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST }));
        await h.store.actions.listComputers!(); // Device cache alone remains stale.
      }
      if (condition === 'unavailable') {
        h.remote.dashboard!.devices = async () => { throw new Error('offline'); };
        await assert.rejects(h.api.devices());
      }
      if (condition === 'malformed') {
        h.remote.dashboard!.devices = async () => [device(), null] as any;
        await h.api.devices();
      }
      const pending = h.api.revoke(DEVICE); await delay(); h.complete(); await pending;
      assert.equal(h.store.state.status, 'connected', condition);
      assert.equal(h.store.saved?.autoConnect, true);
    } finally { h.store.dispose(); }
  }
});
