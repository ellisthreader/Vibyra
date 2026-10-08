import { apiUrl, requestJson } from '../../transport/requestJson';
import { RunError } from './runsApi';
import { parseBrowserAccess, parseBrowserGrant, type BrowserApi } from './browserModel';

/**
 * Agent V2 browser access for one teammate (Phase 7): `agents/v2/agents/{id}/browser`.
 * Refusals keep the status and machine `code`, as the connections client does.
 */
export function createBrowserApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch): BrowserApi {
  const call = async (method: string, agentId: string, body?: unknown) => {
    const identity = token();
    if (!identity) throw new RunError('Sign in to manage browser access.', 401, null);
    let result;
    try {
      result = await requestJson(fetcher, apiUrl(baseUrl, `agents/v2/agents/${encodeURIComponent(agentId)}/browser`), {
        method,
        headers: { Authorization: `Bearer ${identity}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, 25000);
    } catch {
      throw new RunError('Connection interrupted. Try again.', 0, null);
    }
    const { response, data } = result;
    if (identity !== token()) throw new RunError('Your account changed. Refresh to continue.', 401, null);
    if (!response.ok) {
      const field = data.errors && typeof data.errors === 'object' ? Object.values(data.errors as Record<string, string[]>)[0]?.[0] : undefined;
      throw new RunError(data.message ?? data.error ?? field ?? 'Browser access could not be reached.', response.status,
        typeof data.code === 'string' ? data.code : null);
    }
    return data;
  };
  return {
    get: async agentId => parseBrowserAccess(await call('GET', agentId)),
    put: async (agentId, origins) => {
      const grant = parseBrowserGrant((await call('PUT', agentId, { origins }))?.browser);
      if (!grant) throw new RunError('This server returned unsupported browser access.', 502, null);
      return grant;
    },
    remove: async agentId => { await call('DELETE', agentId); },
  };
}
