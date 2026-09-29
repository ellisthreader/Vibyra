import type { DeviceChallenge, RemoteDevice, RemoteSecurityApi } from './securityTypes';
type Call = (method: string, path: string, body?: object) => Promise<Record<string, unknown>>;
const uuid = /^[a-f0-9-]{36}$/;
const failure = () => new Error('Vibyra returned an invalid security response. Try again.');
function device(raw: unknown): RemoteDevice {
  const value = raw as RemoteDevice;
  if (!value || !uuid.test(value.id) || !/^[a-f0-9]{64}$/.test(value.hostId) ||
    !/^[a-f0-9]{64}$/.test(value.publicKey) || typeof value.deviceName !== 'string' || !Array.isArray(value.permissions)) throw failure();
  return value;
}
export function createRemoteSecurityApi(call: Call, base: string, name: string, passkeyOrigin = base): RemoteSecurityApi {
  return {
    register: async (hostId, publicKey, permissions) => device((await call('POST', '/api/security/devices/register',
      { hostId, publicKey, deviceName: name, permissions })).device),
    device: async id => device((await call('GET', `/api/security/devices/${encodeURIComponent(id)}`)).device),
    challenge: async (id, purpose, permissions = []) => {
      const value = await call('POST', `/api/security/devices/${encodeURIComponent(id)}/challenge`, { purpose, permissions }) as unknown as DeviceChallenge;
      if (!uuid.test(value.challengeId) || value.deviceId !== id || value.purpose !== purpose ||
        typeof value.ciphertext !== 'string' || value.ciphertext.length > 112 || !Array.isArray(value.permissions)) throw failure();
      return value;
    },
    hasPasskeys: async () => {
      const value = await call('GET', '/api/security/passkeys');
      if (!Array.isArray(value.passkeys)) throw failure();
      return value.passkeys.length > 0;
    },
    begin: async (deviceId, purpose, challengeId, proof) => {
      const value = await call('POST', '/api/security/passkeys/begin', { deviceId, purpose, challengeId, proof });
      if (typeof value.id !== 'string' || typeof value.url !== 'string') throw failure();
      const url = new URL(value.url);
      const allowedOrigins = [new URL(base).origin, new URL(passkeyOrigin).origin];
      if (!allowedOrigins.includes(url.origin) || url.pathname !== '/remote/verify' || url.username || url.password ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw failure();
      return { id: value.id, url: value.url };
    },
    ceremony: async id => {
      const value = await call('GET', `/api/security/passkeys/ceremonies/${encodeURIComponent(id)}`);
      if (!['waiting', 'verified', 'failed', 'expired'].includes(String(value.status))) throw failure();
      return value.status as 'waiting' | 'verified' | 'failed' | 'expired';
    },
    session: async id => {
      const value = (await call('GET', `/api/remote/sessions/${encodeURIComponent(id)}`)).session as { status?: unknown };
      if (!value || typeof value.status !== 'string') throw failure();
      return value.status;
    },
    sessionToken: async (id, authorization) => {
      const value = await call('POST', `/api/remote/sessions/${encodeURIComponent(id)}/token`, authorization);
      const host = value.host as { id?: string; name?: string; platform?: string | null };
      if (value.sessionId !== id || !/^[a-z0-9]{32}$/.test(String(value.authorizationId)) ||
        typeof value.token !== 'string' || typeof value.relayUrl !== 'string' || !host ||
        !/^[a-f0-9]{64}$/.test(String(host.id)) || typeof host.name !== 'string') throw failure();
      return { token: value.token, relayUrl: value.relayUrl, sessionId: id, authorizationId: String(value.authorizationId),
        host: { id: host.id!, name: host.name, platform: host.platform ?? null } };
    },
    disconnectSession: async id => { await call('DELETE', `/api/remote/sessions/${encodeURIComponent(id)}`); },
  };
}
