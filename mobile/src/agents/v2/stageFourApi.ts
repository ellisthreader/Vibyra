import { apiUrl, requestJson } from '../../transport/requestJson';
import { RunError, fixOf } from './runsApi';
import type { StageFourApi } from './stageFourClient';
import { stageFourClient } from './stageFourClient';
export function createStageFourApi(base: string, token: () => string | null, fetcher: typeof fetch = fetch): StageFourApi {
  return stageFourClient(async <T>(path: string, body?: unknown, method?: 'PATCH' | 'PUT' | 'DELETE'): Promise<T> => {
    const owner = token(); if (!owner) throw new RunError('Sign in to use Agent Work.', 401, null);
    const { response, data } = await requestJson(fetcher, apiUrl(base, path), { method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { Authorization: `Bearer ${owner}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) }, 25000);
    if (owner !== token()) throw new RunError('Your account changed. Refresh to continue.', 401, null);
    if (!response.ok) throw new RunError(data.error ?? data.message ?? 'Agent Work could not be reached.', response.status, data.code ?? null, fixOf(data));
    return data as T;
  });
}
