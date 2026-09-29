import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemoteApi, RemoteApprovalRequired } from '../src/remote/remoteApi';

const HOST = 'a'.repeat(64), PUBLIC = 'b'.repeat(64), SESSION = 'c'.repeat(32);
const ID = '11111111-1111-4111-8111-111111111111';
const device = { id: ID, hostId: HOST, publicKey: PUBLIC, deviceName: 'iPhone', approvedAt: null,
  deniedAt: null, revokedAt: null, pairingCode: '123456', permissions: ['screen:view'], requestExpiresAt: '2099-01-01T00:00:00Z' };
function apiFor(response: (path: string, data: any) => object, passkeyOrigin = 'https://api.test') {
  const requests: { path: string; data: any; method: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname, data = init.body ? JSON.parse(String(init.body)) : null;
    requests.push({ path, data, method: init.method! });
    return Response.json({ ok: true, ...response(path, data) });
  }) as typeof fetch;
  return { api: createRemoteApi('https://api.test', () => 'account', 'iPhone', fetcher, passkeyOrigin), requests };
}
test('device registration and proof carry only public identity and explicit scope', async () => {
  const { api, requests } = apiFor((path, data) => path.endsWith('challenge') ?
    { challengeId: ID, ciphertext: 'YQ==', deviceId: ID, hostId: HOST, purpose: data.purpose, permissions: data.permissions } : { device });
  await api.security!.register(HOST, PUBLIC, ['screen:view']);
  assert.deepEqual(requests[0].data, { hostId: HOST, publicKey: PUBLIC, deviceName: 'iPhone', permissions: ['screen:view'] });
  await api.security!.challenge(ID, 'connect', ['screen:view']);
  assert.deepEqual(requests[1].data, { purpose: 'connect', permissions: ['screen:view'] });
  assert.equal(JSON.stringify(requests).includes('privateKey'), false);
});
test('passkey URLs must belong to the configured verification origin and page', async () => {
  for (const url of ['https://evil.test/remote/verify#ticket', 'https://api.test/unrelated#ticket',
    'http://api.test/remote/verify#ticket', 'https://name:password@api.test/remote/verify#ticket']) {
    const { api } = apiFor(() => ({ id: ID, url }));
    await assert.rejects(api.security!.begin(ID, 'authenticate', ID, 'proof'), /invalid security/);
  }
  const { api } = apiFor(() => ({ id: ID, url: 'https://api.test/remote/verify#ticket' }));
  assert.equal((await api.security!.begin(ID, 'authenticate', ID, 'proof')).id, ID);
  const website = apiFor(() => ({ id: ID, url: 'https://vibyra.app/remote/verify#ticket' }), 'https://vibyra.app');
  assert.equal((await website.api.security!.begin(ID, 'authenticate', ID, 'proof')).id, ID);
  const hostile = apiFor(() => ({ id: ID, url: 'https://vibyra.app.evil.test/remote/verify#ticket' }), 'https://vibyra.app');
  await assert.rejects(hostile.api.security!.begin(ID, 'authenticate', ID, 'proof'), /invalid security/);
});
test('dashboard lists passkeys and removes only an explicit valid identifier', async () => {
  const passkey = { id: 23, device_name: 'Phone', created_at: '2026-09-29T10:00:00Z', last_used_at: null };
  const { api, requests } = apiFor(() => ({ passkeys: [passkey] }));
  assert.deepEqual(await api.dashboard!.passkeys(), [passkey]);
  await api.dashboard!.removePasskey(23);
  assert.deepEqual(requests[1], { path: '/api/security/passkeys/23', data: null, method: 'DELETE' });
  await assert.rejects(api.dashboard!.removePasskey(NaN), /not available/);
  assert.equal(requests.length, 2);
});
test('Ask Every Time returns a pending session and finalized token binds its exact identifiers', async () => {
  const host = { id: HOST, name: 'Mac', platform: 'macos' };
  const authorization = { deviceId: ID, challengeId: ID, proof: 'proof', permissions: ['screen:view'] as const };
  const { api } = apiFor(path => path.endsWith('/token') ?
    { sessionId: SESSION, authorizationId: SESSION, token: 'remote-grant', relayUrl: 'wss://relay.test', host } :
    { status: 'WAITING_FOR_APPROVAL', sessionId: SESSION, host });
  await assert.rejects(api.connect(HOST, { ...authorization, permissions: [...authorization.permissions] }), error =>
    error instanceof RemoteApprovalRequired && error.sessionId === SESSION);
  const grant = await api.security!.sessionToken(SESSION, { ...authorization, permissions: [...authorization.permissions] });
  assert.equal(grant.sessionId, SESSION); assert.equal(grant.authorizationId, SESSION);
});
