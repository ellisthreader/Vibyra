import { VibesError } from '../../vibes/api';
import { apiUrl, requestJson } from '../../transport/requestJson';
import { modeFromProbe, type EventsPage, type Run, type RunBody } from './runCore';

/** A refusal from /api/agents/v2 keeps the contract's machine `code` beside the words. */
export class RunError extends VibesError {
  /** `fix` is the server's one suggested step (contract §6d), e.g. `choose_ai_account`; it is words, not a command. */
  constructor(message: string, status: number, readonly code: string | null, readonly fix: { action: string; message: string } | null = null) { super(message, status); }
}
/** The refusal's `fix`, when it is well formed. */
export const fixOf = (data: any): { action: string; message: string } | null =>
  data?.fix && typeof data.fix.action === 'string' && typeof data.fix.message === 'string' ? { action: data.fix.action, message: data.fix.message } : null;
export interface RunsApi {
  /** v2 when the account may use it; `final: false` means ask again later (transport loss, 5xx). */
  probe(): Promise<{ mode: 'v1' | 'v2'; final: boolean }>;
  admit(body: RunBody): Promise<Run>;
  list(agentId: string): Promise<Run[]>;
  run(id: string): Promise<Run>;
  events(id: string, after: number): Promise<EventsPage>;
  cancel(id: string): Promise<Run>;
  decide(actionId: string, fingerprint: string, decision: 'allow' | 'decline'): Promise<void>;
}
const id = (value: string) => encodeURIComponent(value);

/** Account-token client for the v2 run API. GETs use ETag/If-None-Match and reuse the cached body on 304. */
export function createRunsApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch): RunsApi {
  const cache = new Map<string, { etag: string; data: any }>();
  const call = async (path: string, body?: unknown) => {
    const identity = token();
    if (!identity) throw new RunError('Sign in to message your teammates.', 401, null);
    const url = apiUrl(baseUrl, `agents/v2/${path}`);
    const cached = body === undefined ? cache.get(url) : undefined;
    let result;
    try {
      result = await requestJson(fetcher, url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${identity}`, Accept: 'application/json', 'Content-Type': 'application/json',
          ...(cached && { 'If-None-Match': cached.etag }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, 25000);
    } catch {
      throw new RunError('Connection interrupted. Refresh to check your request.', 0, null);
    }
    const { response, data } = result;
    if (identity !== token()) throw new RunError('Your account changed. Refresh to continue.', 401, null);
    if (response.status === 304 && cached) return cached.data;
    if (!response.ok)
      throw new RunError(data.error ?? data.message ?? 'Teammate tasks could not be reached.', response.status,
        typeof data.code === 'string' ? data.code : null, fixOf(data));
    const etag = response.headers.get('ETag');
    if (body === undefined && etag) {
      if (cache.size > 200) cache.clear();
      cache.set(url, { etag, data });
    }
    return data;
  };
  const run = (data: any): Run => {
    if (!data?.run || typeof data.run.id !== 'string') throw new RunError('This server returned an unsupported task.', 502, null);
    return data.run;
  };
  return {
    probe: async () => {
      try { await call('runtimes'); return modeFromProbe(200); }
      catch (error) { return modeFromProbe(error instanceof RunError && error.status ? error.status : null); }
    },
    admit: async (body) => run(await call('runs', body)),
    list: async (agentId) => {
      const data = await call(`runs?agentId=${id(agentId)}&limit=20`);
      if (!Array.isArray(data.runs)) throw new RunError('This server returned an unsupported task list.', 502, null);
      return data.runs;
    },
    run: async (runId) => run(await call(`runs/${id(runId)}`)),
    events: async (runId, after) => {
      const data = await call(`runs/${id(runId)}/events?after=${after}&limit=200`);
      if (!Array.isArray(data.events)) throw new RunError('This server returned unsupported task events.', 502, null);
      return data;
    },
    cancel: async (runId) => run(await call(`runs/${id(runId)}/cancel`, {})),
    decide: async (actionId, fingerprint, decision) => {
      await call(`actions/${id(actionId)}/decision`, { fingerprint, decision });
    },
  };
}
