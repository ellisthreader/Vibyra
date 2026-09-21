/** A computer registered to the account, as Vibyra Cloud lists it. */
export interface CloudComputer {
  id: string; name: string; platform: string | null; version: string | null;
  online: boolean; lastSeenAt: string | null; activeSessions: number;
}
export interface CloudComputers { live: boolean; entitled: boolean; computers: CloudComputer[] }
/** One grant to reach a computer through the relay: where, with what, minutes long. */
export interface CloudGrant { relayUrl: string; token: string; host: { id: string; name: string; platform: string | null } }
export interface RemoteApi {
  computers(): Promise<CloudComputers>;
  connect(hostId: string): Promise<CloudGrant>;
}
export const SIGNED_OUT = 'Sign in to reach your computer from anywhere.';
export class RemoteError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'RemoteError'; }
}
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** The phone side of /api/remote: the account's computers and connection grants. */
export function createRemoteApi(baseUrl: string, token: () => string | null, deviceName: string, fetchImpl: typeof fetch = fetch): RemoteApi {
  const root = baseUrl.replace(/\/+$/, '');
  const call = async (method: string, path: string, body?: object): Promise<Record<string, unknown>> => {
    const bearer = token();
    if (!bearer) throw new RemoteError(SIGNED_OUT, 401);
    let response: Response; let payload: Record<string, unknown> | null;
    try {
      response = await fetchImpl(`${root}${path}`, { method, signal: AbortSignal.timeout(15000), headers: {
        Accept: 'application/json', Authorization: `Bearer ${bearer}`, ...(body ? { 'Content-Type': 'application/json' } : {}),
      }, body: body ? JSON.stringify(body) : undefined });
      payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    } catch { throw new RemoteError('Vibyra Cloud could not be reached. Check your connection and try again.', 0); }
    if (!response.ok || !payload || payload.ok !== true) {
      const message = text(payload?.error) ?? (response.status === 401 ? SIGNED_OUT
        : response.status >= 500 ? 'Vibyra Cloud is having trouble right now. Try again in a moment.' : 'Vibyra Cloud refused that request.');
      throw new RemoteError(message, response.status);
    }
    return payload;
  };
  const computer = (raw: unknown): CloudComputer | null => {
    const value = raw as Record<string, unknown> | null;
    if (!value || typeof value.id !== 'string' || !/^[a-f0-9]{64}$/.test(value.id)) return null;
    return { id: value.id, name: text(value.name) ?? 'Computer', platform: text(value.platform), version: text(value.version),
      online: value.online === true, lastSeenAt: text(value.lastSeenAt), activeSessions: typeof value.activeSessions === 'number' ? value.activeSessions : 0 };
  };
  return {
    computers: async () => {
      const data = await call('GET', '/api/remote/hosts');
      const list = Array.isArray(data.computers) ? data.computers.map(computer).filter((item): item is CloudComputer => item !== null) : [];
      return { live: data.live === true, entitled: data.entitled === true, computers: list };
    },
    connect: async hostId => {
      const data = await call('POST', `/api/remote/hosts/${encodeURIComponent(hostId)}/connect`, { clientName: deviceName });
      const host = computer(data.host);
      if (typeof data.relayUrl !== 'string' || typeof data.token !== 'string' || !host || host.id !== hostId) {
        throw new RemoteError('Vibyra Cloud returned an unexpected grant. Try again.', 0);
      }
      return { relayUrl: data.relayUrl, token: data.token, host: { id: host.id, name: host.name, platform: host.platform } };
    },
  };
}
