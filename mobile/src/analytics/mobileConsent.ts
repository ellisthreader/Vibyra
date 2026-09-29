import { apiUrl, requestJson } from '../transport/requestJson';

export type AnalyticsChoice = 'unknown' | 'declined' | 'aggregate' | 'linked';
export type ConsentSnapshot = { ready: boolean; choice: AnalyticsChoice; saving: boolean; error: string | null };
export type ConsentStorage = { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void> };
export type AnalyticsEvent = { event: string; properties: object };
export interface MobileAnalyticsCore<Event extends AnalyticsEvent> {
  track(event: Event): Promise<void>;
  opened(properties: Extract<Event, { event: 'mobile_app_opened' }>['properties']): Promise<void>;
  refresh(scope: string): Promise<void>;
  choose(choice: Exclude<AnalyticsChoice, 'unknown'>): Promise<boolean>;
  snapshot(): ConsentSnapshot;
  subscribe(listener: () => void): () => void;
}

const POLICY_VERSION = 1;
const QUEUE_LIMIT = 32;
const QUEUE_AGE_MS = 24 * 60 * 60_000;
const memoryFlags = new Map<string, string>();
const defaultStorage: ConsentStorage = {
  read: async key => memoryFlags.get(key) ?? null,
  write: async (key, value) => { memoryFlags.set(key, value); },
};
const allowed = (choice: AnalyticsChoice) => choice === 'aggregate' || choice === 'linked';
const localKey = (scope: string) => `mobile.analytics.v${POLICY_VERSION}.${scope}`;
type Queued = { identity: string; body: string; at: number };

/** Optional first-party telemetry, gated by both a local choice and the server ledger. */
export function createConsentEmitter<Event extends AnalyticsEvent>(
  baseUrl: string,
  token: () => Promise<string | null>,
  uuid: () => string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
  storage: ConsentStorage = defaultStorage,
): MobileAnalyticsCore<Event> {
  let state: ConsentSnapshot = { ready: false, choice: 'unknown', saving: false, error: null };
  let scope = '';
  let revision = 0;
  let lastOpened = 0;
  let lastOpenedIdentity: string | null = null;
  let queue: Queued[] = [];
  let queueIdentity: string | null = null;
  let approvedIdentity: string | null = null;
  let flushing = false;
  let consentWrite: Promise<AnalyticsChoice> = Promise.resolve('unknown');
  let retry: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: ConsentSnapshot) => { state = next; listeners.forEach(listener => listener()); };
  const clear = () => {
    queue = []; queueIdentity = null; lastOpened = 0; lastOpenedIdentity = null;
    if (retry) { clearTimeout(retry); retry = null; }
  };
  const consentRequest = async (method: 'GET' | 'PUT', identity: string, choice?: AnalyticsChoice) => {
    const path = `analytics/consent${method === 'GET' ? '?surface=mobile' : ''}`;
    const { response, data } = await requestJson(fetcher, apiUrl(baseUrl, path), {
      method, headers: { Authorization: `Bearer ${identity}`, Accept: 'application/json',
        ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'PUT' ? { body: JSON.stringify({ surface: 'mobile', choice, policy_version: POLICY_VERSION }) } : {}),
    }, 8000);
    if (!response.ok || !['unknown', 'declined', 'aggregate', 'linked'].includes(data.choice))
      throw new Error('Could not save your privacy choice. Try again.');
    return data.choice as AnalyticsChoice;
  };
  // Preserve the order of a rapid Decline → Allow or Allow → Decline choice.
  const saveChoice = (identity: string, choice: AnalyticsChoice) => {
    consentWrite = consentWrite.catch(() => 'unknown').then(() => consentRequest('PUT', identity, choice));
    return consentWrite;
  };
  const flush = async () => {
    if (flushing || !allowed(state.choice)) return;
    flushing = true;
    try {
      while (queue.length && allowed(state.choice)) {
        const item = queue[0]!;
        if (now() - item.at > QUEUE_AGE_MS) { queue.shift(); continue; }
        const identity = await token().catch(() => null);
        if (!identity || identity !== item.identity) { clear(); break; }
        let status = 0;
        try {
          const result = await requestJson(fetcher, apiUrl(baseUrl, 'analytics/events'), {
            method: 'POST', headers: { Authorization: `Bearer ${identity}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: item.body,
          }, 8000);
          status = result.response.status;
        } catch { /* Retry while this process remains open. */ }
        if (!allowed(state.choice) || queue[0] !== item) break;
        if (status === 202 || (status >= 400 && status < 500 && status !== 429)) {
          queue.shift();
          if (status === 401 || status === 403) { clear(); break; }
        } else {
          retry = setTimeout(() => { retry = null; void flush(); }, 30_000);
          break;
        }
      }
    } finally { flushing = false; }
  };
  const enqueue = async (event: Event, identity?: string) => {
    if (!allowed(state.choice)) return;
    const current = identity ?? await token().catch(() => null);
    if (!current || current !== approvedIdentity || !allowed(state.choice)) return;
    if (queueIdentity && queueIdentity !== current) clear();
    queueIdentity = current;
    queue.push({ identity: current, at: now(), body: JSON.stringify({ ...event, surface: 'mobile', consent_mode: state.choice, event_id: uuid(), occurred_at: new Date(now()).toISOString() }) });
    if (queue.length > QUEUE_LIMIT) queue.shift();
    void flush();
  };
  return {
    snapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    refresh: async (nextScope) => {
      if (!nextScope) return;
      if (scope !== nextScope) {
        scope = nextScope; revision++; clear(); approvedIdentity = null;
        publish({ ready: false, choice: 'unknown', saving: false, error: null });
      }
      const currentRevision = revision;
      try {
        const local = (await storage.read(localKey(scope))) as AnalyticsChoice || 'unknown';
        if (currentRevision !== revision) return;
        if (local === 'declined' || !allowed(local)) {
          approvedIdentity = null;
          if (local === 'declined') {
            const identity = await token().catch(() => null);
            if (currentRevision !== revision) return;
            if (identity) void saveChoice(identity, 'declined').catch(() => {});
          }
          publish({ ready: true, choice: local === 'declined' ? 'declined' : 'unknown', saving: false, error: null }); return;
        }
        const identity = await token();
        if (!identity) throw new Error('Sign in or connect to save your privacy choice.');
        const remote = await consentRequest('GET', identity);
        if (currentRevision !== revision) return;
        const choice = !allowed(remote) ? remote : local === 'aggregate' ? 'aggregate' : remote;
        if (!allowed(choice)) clear();
        approvedIdentity = allowed(choice) ? identity : null;
        publish({ ready: true, choice, saving: false, error: null });
        if (allowed(choice)) void flush();
      } catch {
        if (currentRevision === revision) {
          clear(); approvedIdentity = null; publish({ ready: true, choice: 'unknown', saving: false, error: 'Could not check your privacy choice. Try again.' });
        }
      }
    },
    choose: async choice => {
      revision++;
      const currentRevision = revision;
      clear(); approvedIdentity = null;
      if (choice === 'declined') {
        publish({ ready: true, choice, saving: false, error: null });
        try { await storage.write(localKey(scope), choice); } catch { /* Current process remains declined. */ }
        const identity = await token().catch(() => null);
        if (identity && currentRevision === revision) void saveChoice(identity, choice).catch(() => {});
        return true;
      }
      publish({ ready: true, choice: 'unknown', saving: true, error: null });
      try {
        const identity = await token();
        if (!identity) throw new Error('Sign in or connect to save your privacy choice.');
        if (currentRevision !== revision) return false;
        const remote = await saveChoice(identity, choice);
        if (currentRevision !== revision) return false;
        if (remote !== choice) throw new Error('The server did not save your privacy choice.');
        await storage.write(localKey(scope), choice);
        if (currentRevision !== revision) return false;
        approvedIdentity = identity;
        publish({ ready: true, choice, saving: false, error: null });
        return true;
      } catch (error) {
        if (currentRevision === revision) publish({ ready: true, choice: 'unknown', saving: false, error: (error as Error).message });
        return false;
      }
    },
    track: event => enqueue(event),
    opened: async properties => {
      if (!allowed(state.choice)) return;
      const identity = await token().catch(() => null);
      if (!identity || identity !== approvedIdentity || !allowed(state.choice)) return;
      if (identity === lastOpenedIdentity && now() - lastOpened < 5 * 60_000) return;
      lastOpened = now(); lastOpenedIdentity = identity;
      await enqueue({ event: 'mobile_app_opened', properties } as Event, identity);
    },
  };
}
