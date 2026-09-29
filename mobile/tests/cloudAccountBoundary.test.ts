import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemoteApi } from '../src/remote/remoteApi';
import { cloudHarness, delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

const HOST = 'ab'.repeat(32);
async function connected(cloud = true) {
  const remote = cloudHarness();
  const h = runtimeHarness({ remote, retryDelays: [1, 2] });
  h.handle(message => {
    if (message.type === 'send' && message.payload.method === 'host.state') {
      h.reply(message, { ...structuredClone(hostState), host: { ...hostState.host, id: HOST } });
      return true;
    }
    return false;
  });
  await h.store.actions.logIn!('ellis@example.com', 'longenough');
  if (cloud) await h.store.actions.connectComputer!(HOST);
  else await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST }));
  return { ...h, remote };
}

test('a response from a former account cannot disclose its computer list or connection grant', async () => {
  for (const operation of ['computers', 'connect'] as const) {
    let bearer: string | null = 'account-a';
    let release!: () => void;
    const fetcher = (async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return Response.json({ ok: true, computers: [], host: { id: HOST }, token: 'old-grant', relayUrl: 'wss://relay.test' });
    }) as typeof fetch;
    const api = createRemoteApi('https://api.test', () => bearer, 'iPhone', fetcher);
    const response = operation === 'connect' ? api.connect(HOST) : api.computers();
    bearer = operation === 'connect' ? null : 'account-b';
    release();
    await assert.rejects(response, /account changed/);
  }
});

test('logout immediately closes cloud control and keeps it put away across foreground resumes', async () => {
  const h = await connected();
  try {
    await h.store.actions.logOut!();
    assert.equal(h.store.state.status, 'offline');
    assert.equal(h.store.token, null);
    assert.equal(h.store.saved?.autoConnect, false);
    assert.equal(JSON.parse(h.memory.get('connection')!).autoConnect, false);
    await assert.rejects(h.rpc.request('session.input', {}), /Connect to your computer/);
    const asked = h.remote.asked.length;
    h.store.resume(); await delay(20);
    assert.equal(h.remote.asked.length, asked);
  } finally { h.store.dispose(); }
});

test('adopting a different account session closes the old cloud socket', async () => {
  const h = await connected();
  try {
    await h.store.actions.adoptSession!({ token: 'account-b', user: { email: 'other@example.com', name: 'Other', plan: 'free' } });
    assert.equal(h.store.state.status, 'offline');
    assert.equal(h.store.token, 'account-b');
    assert.equal(h.store.saved?.autoConnect, false);
  } finally { h.store.dispose(); }
});

test('a delayed grant cannot open a cloud socket after logout or explicit disconnect', async () => {
  for (const action of ['logout', 'disconnect']) {
    const h = await connected();
    try {
      let release!: () => void;
      const grant = await h.remote.connect(HOST);
      h.remote.connect = async () => { await new Promise<void>(resolve => { release = resolve; }); return grant; };
      const pending = h.store.actions.connectComputer!(HOST);
      if (action === 'logout') await h.store.actions.logOut!();
      else await h.store.actions.disconnect();
      const opened = h.sent.filter(message => message.type === 'open').length;
      release(); await assert.rejects(pending, /connection changed|account changed/i);
      assert.equal(h.sent.filter(message => message.type === 'open').length, opened);
      assert.equal(h.store.state.status, 'offline');
    } finally { h.store.dispose(); }
  }
});

test('account logout preserves the independently approved nearby Noise connection', async () => {
  const h = await connected(false);
  try {
    await h.store.actions.logOut!();
    assert.equal(h.store.state.status, 'connected');
    assert.equal(h.store.state.throughCloud, false);
    assert.equal((await h.rpc.request('host.state')).host.id, HOST);
  } finally { h.store.dispose(); }
});
