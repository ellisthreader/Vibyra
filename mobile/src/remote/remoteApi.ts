import { createRemoteSecurityApi } from './securityApi';
import type { RemoteAuthorization, RemoteSecurityApi } from './securityTypes';
import { createDashboardApi, type RemoteDashboardApi } from './dashboardApi';
/** A computer registered to the account, as Vibyra Cloud lists it. */
export interface CloudComputer {
  id: string;
  name: string;
  platform: string | null;
  version: string | null;
  online: boolean;
  lastSeenAt: string | null;
  activeSessions: number;
}
export interface CloudComputers {
  live: boolean;
  entitled: boolean;
  computers: CloudComputer[];
}
/** One grant to reach a computer through the relay: where, with what, minutes long. */
export interface CloudGrant {
  relayUrl: string;
  token: string;
  sessionId?: string;
  authorizationId?: string;
  host: { id: string; name: string; platform: string | null };
}
export interface RemoteApi {
  dashboard?: RemoteDashboardApi;
  security?: RemoteSecurityApi;
  computers(): Promise<CloudComputers>;
  connect(hostId: string, authorization?: RemoteAuthorization): Promise<CloudGrant>;
}
export const SIGNED_OUT = 'Sign in to reach your computer from anywhere.';
export class RemoteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}
export class RemoteApprovalRequired extends Error {
  constructor(readonly sessionId: string) { super('Approve this connection on your computer.'); }
}
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** The phone side of /api/remote: the account's computers and connection grants. */
export function createRemoteApi(
  baseUrl: string,
  token: () => string | null,
  deviceName: string,
  fetchImpl: typeof fetch = fetch,
  passkeyOrigin: string = baseUrl,
): RemoteApi {
  const root = baseUrl.replace(/\/+$/, '');
  const call = async (
    method: string,
    path: string,
    body?: object,
  ): Promise<Record<string, unknown>> => {
    const bearer = token();
    if (!bearer) throw new RemoteError(SIGNED_OUT, 401);
    let response: Response;
    let payload: Record<string, unknown> | null;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method,
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      throw new RemoteError(
        'Vibyra Cloud could not be reached. Check your connection and try again.',
        0,
      );
    }
    if (token() !== bearer)
      throw new RemoteError('The signed-in account changed. Connect again from your current account.', 401);
    if (!response.ok || !payload || payload.ok !== true) {
      const message =
        text(payload?.error) ??
        (response.status === 401
          ? SIGNED_OUT
          : response.status >= 500
            ? 'Vibyra Cloud is having trouble right now. Try again in a moment.'
            : 'Vibyra Cloud refused that request.');
      throw new RemoteError(message, response.status);
    }
    return payload;
  };
  const computer = (raw: unknown): CloudComputer | null => {
    const value = raw as Record<string, unknown> | null;
    if (!value || typeof value.id !== 'string' || !/^[a-f0-9]{64}$/.test(value.id)) return null;
    return {
      id: value.id,
      name: text(value.name) ?? 'Computer',
      platform: text(value.platform),
      version: text(value.version),
      online: value.online === true,
      lastSeenAt: text(value.lastSeenAt),
      activeSessions: typeof value.activeSessions === 'number' ? value.activeSessions : 0,
    };
  };
  return {
    dashboard: createDashboardApi(call, token),
    security: createRemoteSecurityApi(call, root, deviceName, passkeyOrigin),
    computers: async () => {
      const data = await call('GET', '/api/remote/hosts');
      const list = Array.isArray(data.computers)
        ? data.computers.map(computer).filter((item): item is CloudComputer => item !== null)
        : [];
      return { live: data.live === true, entitled: data.entitled === true, computers: list };
    },
    connect: async (hostId, authorization) => {
      const data = await call('POST', `/api/remote/hosts/${encodeURIComponent(hostId)}/connect`, {
        clientName: deviceName,
        ...authorization,
      });
      const host = computer(data.host);
      if (authorization && host?.id === hostId && data.status === 'WAITING_FOR_APPROVAL' && /^[a-z0-9]{32}$/.test(String(data.sessionId)))
        throw new RemoteApprovalRequired(String(data.sessionId));
      if (
        typeof data.relayUrl !== 'string' ||
        typeof data.token !== 'string' ||
        !host ||
        host.id !== hostId
      ) {
        throw new RemoteError('Vibyra Cloud returned an unexpected grant. Try again.', 0);
      }
      if (authorization && (!/^[a-z0-9]{32}$/.test(String(data.sessionId)) ||
        !/^[a-z0-9]{32}$/.test(String(data.authorizationId))))
        throw new RemoteError('Update Vibyra on your computer before connecting securely.', 0);
      return {
        relayUrl: data.relayUrl,
        token: data.token,
        ...(authorization ? { sessionId: String(data.sessionId), authorizationId: String(data.authorizationId) } : {}),
        host: { id: host.id, name: host.name, platform: host.platform },
      };
    },
  };
}
