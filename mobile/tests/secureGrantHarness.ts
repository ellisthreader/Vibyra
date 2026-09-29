import { runtimeHarness, cloudHarness } from './runtimeHarness';
import type { RemoteSecurityApi, RemoteDevice, RemoteAuthorization } from '../src/remote/securityTypes';
import { RemoteApprovalRequired } from '../src/remote/remoteApi';

export const HOST = 'ab'.repeat(32), PUBLIC = 'ef'.repeat(32);
export const DEVICE = '11111111-1111-4111-8111-111111111111';
export const SESSION = 's'.repeat(32);
export async function securityHarness() {
  const remote = cloudHarness();
  const h = runtimeHarness({ remote, retryDelays: [] });
  const requests: { kind: string; data?: unknown }[] = [];
  const device: RemoteDevice = { id: DEVICE, hostId: HOST, publicKey: PUBLIC, deviceName: 'iPhone', pairingCode: '123456',
    permissions: ['preview:access', 'screen:view', 'terminal:access'],
    approvedAt: new Date().toISOString(), deniedAt: null, revokedAt: null, requestExpiresAt: new Date(Date.now() + 600000).toISOString() };
  let challenge = 0;
  let sessionCalls = 0;
  const grant = { relayUrl: 'wss://relay.test', token: 'scoped-grant', sessionId: SESSION, authorizationId: SESSION,
    host: { id: HOST, name: 'Mac', platform: 'macos' } };
  const api: RemoteSecurityApi = {
    register: async (_host, _key, permissions) => { requests.push({ kind: 'register', data: permissions }); return { ...device }; },
    device: async () => { requests.push({ kind: 'device' }); return { ...device }; },
    challenge: async (id, purpose, permissions = []) => {
      requests.push({ kind: purpose, data: permissions });
      return { deviceId: id, hostId: HOST, purpose, permissions, ciphertext: `challenge-${++challenge}`,
        challengeId: `00000000-0000-4000-8000-${String(challenge).padStart(12, '0')}` };
    },
    hasPasskeys: async () => true,
    begin: async (...args) => { requests.push({ kind: 'begin', data: args }); return { id: DEVICE, url: 'https://api.test/remote/verify#secret' }; },
    ceremony: async () => 'verified',
    session: async () => { sessionCalls++; return sessionCalls > 1 ? 'AUTHORIZED' : 'WAITING_FOR_APPROVAL'; },
    sessionToken: async (_id, authorization) => { requests.push({ kind: 'sessionToken', data: authorization }); return grant; },
    disconnectSession: async id => { requests.push({ kind: 'disconnect', data: id }); },
  };
  remote.security = api;
  remote.connect = async (_host, authorization?: RemoteAuthorization) => { requests.push({ kind: 'grant', data: authorization }); return grant; };
  h.store.deps.remoteBrowser = () => {
    requests.push({ kind: 'browser' });
    return { open(url) { requests.push({ kind: 'open', data: url }); }, closed: () => false, close() { requests.push({ kind: 'close' }); } };
  };
  h.handle(message => {
    if (message.type !== 'device-proof') return false;
    h.rpc.receive({ type: 'device-proof', requestId: message.requestId, publicKey: PUBLIC,
      proof: message.ciphertext ? 'proof-value' : undefined });
    return true;
  });
  await h.store.actions.logIn!('ellis@example.com', 'longenough');
  return { ...h, api, remote, requests, device, grant,
    pending() { remote.connect = async () => { throw new RemoteApprovalRequired(SESSION); }; } };
}
