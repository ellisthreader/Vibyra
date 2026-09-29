import assert from 'node:assert/strict';
import test from 'node:test';
import { delay } from './runtimeHarness';
import { connected, HOST, invoke, targets, type Action } from './remoteSecurityHarness';

test('every matching security action immediately closes control before a failed server response and stays put away', async () => {
  for (const action of Object.keys(targets) as Action[]) {
    const h = await connected();
    try {
      const pending = invoke(h.api, action);
      const rejection = assert.rejects(pending, /This phone disconnected.*unconfirmed/);
      assert.equal(h.store.state.status, 'offline', action);
      assert.equal(h.store.saved?.autoConnect, false, action);
      assert.equal(h.calls.length, 0, 'local close precedes the first server call');
      await assert.rejects(h.rpc.request('session.input', {}), /Connect to your computer/);
      await delay(); assert.deepEqual(h.calls, ['server']); h.fail(); await rejection;
      assert.equal(JSON.parse(h.memory.get('connection')!).autoConnect, false);
      const requests = h.remote.asked.length;
      h.store.resume(); await delay(15);
      assert.equal(h.remote.asked.length, requests, action);
    } finally { h.store.dispose(); }
  }
});

test('account security controls preserve independent nearby transport and its reconnect preference', async () => {
  for (const action of Object.keys(targets) as Action[]) {
    const h = await connected(false);
    try {
      const pending = invoke(h.api, action); const rejection = assert.rejects(pending, /unconfirmed/);
      assert.equal(h.store.state.status, 'connected', action);
      assert.equal(h.store.saved?.autoConnect, true);
      assert.equal((await h.rpc.request('host.state')).host.id, HOST);
      h.fail(); await rejection;
      assert.equal(h.store.state.status, 'connected');
    } finally { h.store.dispose(); }
  }
});

test('revoking another device or session leaves this cloud connection running', async () => {
  for (const action of ['disconnect', 'revoke'] as const) {
    const h = await connected();
    try {
      const pending = h.api[action]('another-resource'); const rejection = assert.rejects(pending, /unconfirmed/);
      await delay(); h.fail(); await rejection;
      assert.equal(h.store.state.status, 'connected');
      assert.equal(h.store.saved?.autoConnect, true);
      assert.equal((await h.rpc.request('host.state')).host.id, HOST);
    } finally { h.store.dispose(); }
  }
});

test('global disable fences a grant in flight before it can reopen the transport', async () => {
  const h = await connected();
  try {
    let release!: () => void;
    const grant = await h.remote.connect(HOST);
    h.remote.connect = async () => { await new Promise<void>(resolve => { release = resolve; }); return grant; };
    const connecting = h.store.actions.connectComputer!(HOST);
    const closed = assert.rejects(connecting, /connection changed/);
    const pending = h.api.disable(); const rejected = assert.rejects(pending, /unconfirmed/);
    const opened = h.sent.filter(message => message.type === 'open').length;
    await delay(); h.fail(); await rejected; release(); await closed;
    assert.equal(h.sent.filter(message => message.type === 'open').length, opened);
    assert.equal(h.store.saved?.autoConnect, false);
  } finally { h.store.dispose(); }
});

test('failed local persistence still attempts revocation and removes only the remembered cloud connection', async () => {
  const h = await connected();
  try {
    h.store.deps.storage.write = async () => { throw new Error('storage full'); };
    const pending = h.api.disable();
    await delay(); assert.deepEqual(h.calls, ['server']); h.complete(); await pending;
    assert.equal(h.memory.has('connection'), false);
    assert.equal(h.store.state.status, 'offline');
  } finally { h.store.dispose(); }
});

test('account replacement before API dispatch cannot disable the new account', async () => {
  const h = await connected();
  try {
    const pending = h.api.disable();
    h.store.token = 'new-account';
    await assert.rejects(pending, /unconfirmed/);
    assert.deepEqual(h.calls, []);
  } finally { h.store.dispose(); }
});

test('persistence cannot delay the server request, and double storage failure is reported without reopening', async () => {
  const h = await connected();
  try {
    let rejectWrite!: (error: Error) => void;
    h.store.deps.storage.write = () => new Promise((_, reject) => { rejectWrite = reject; });
    h.store.deps.storage.delete = async () => { throw new Error('storage unavailable'); };
    const pending = h.api.disable(); const rejected = assert.rejects(pending, /unconfirmed.*Keep Vibyra closed/);
    assert.equal(h.store.state.status, 'offline');
    await delay(); assert.deepEqual(h.calls, ['server']);
    h.fail(); rejectWrite(new Error('storage unavailable')); await rejected;
    assert.equal(h.store.saved?.autoConnect, false);
  } finally { h.store.dispose(); }
});

test('disabling an in-flight Cloud fallback prevents the same remembered computer from retrying via LAN', async () => {
  const h = await connected(false);
  try {
    h.store.disconnect();
    h.store.update({ status: 'connecting' });
    h.store.cloudSecurityScope = { owner: h.store.token, hostId: HOST, deviceId: targets.revoke };
    const pending = h.api.disable(); const rejected = assert.rejects(pending, /unconfirmed/);
    await delay(); h.fail(); await rejected;
    assert.equal(h.store.saved?.autoConnect, false);
    const opened = h.sent.filter(message => message.type === 'open').length;
    h.store.resume(); await delay(15);
    assert.equal(h.sent.filter(message => message.type === 'open').length, opened);
  } finally { h.store.dispose(); }
});
