import { apiUrl, requestJson } from '../../transport/requestJson';
import { RunError, fixOf } from './runsApi';
import { stageTwoClient, type StageTwoCall } from './stageTwoModel';

export function createStageTwoApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch) {
  const call: StageTwoCall = async <T,>(path: string, body?: unknown, method?: 'PATCH' | 'PUT' | 'DELETE'): Promise<T> => {
    const identity = token();
    if (!identity) throw new RunError('Sign in to use your teammates.', 401, null);
    let result;
    try {
      result = await requestJson(fetcher, apiUrl(baseUrl, path), {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: { Authorization: `Bearer ${identity}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, 25000);
    } catch { throw new RunError('Connection interrupted. Refresh to check the outcome.', 0, null); }
    if (identity !== token()) throw new RunError('Your account changed. Refresh to continue.', 401, null);
    const { response, data } = result;
    if (!response.ok) throw new RunError(data.error ?? data.message ?? 'This change could not be confirmed.', response.status, data.code ?? null, fixOf(data));
    return data as T;
  };
  return stageTwoClient(call);
}
