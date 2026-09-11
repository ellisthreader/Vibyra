import { normalizeReasoning } from '../ui/effort';
import type { VibesApi, VibesEntitlements, VibesLimits, VibesModel, VibesWallet, VibesWindow } from './types';

export class VibesError extends Error { constructor(message: string, readonly status: number) { super(message); } }
/** Smallest entitlement set. A backend that omits limits must never widen them here. */
const FLOOR: VibesEntitlements = { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false,
  sessionCredits: 60, weekCredits: 150 };
/** One window allowance. Zero is a plan that can never send, so it is not "off". */
const rate = (value: unknown, floor: number): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : floor;
export function normalizeEntitlements(value: unknown): VibesEntitlements {
  const e = (value ?? {}) as Partial<VibesEntitlements>;
  const projects = e.maxProjects;
  return {
    maxProjects: projects === null ? null : typeof projects === 'number' && Number.isSafeInteger(projects) && projects > 0 ? projects : FLOOR.maxProjects,
    concurrentReplies: typeof e.concurrentReplies === 'number' && e.concurrentReplies >= 1 ? Math.floor(e.concurrentReplies) : FLOOR.concurrentReplies,
    fullCatalogue: e.fullCatalogue === true, remoteAccess: e.remoteAccess === true,
    // A window the backend did not publish falls to the floor rather than to
    // "unlimited": the phone only ever reports a rate the server will enforce.
    sessionCredits: rate(e.sessionCredits, FLOOR.sessionCredits),
    weekCredits: rate(e.weekCredits, FLOOR.weekCredits),
  };
}
/**
 * A count the backend published, or `null` when it did not. The trial figures
 * describe the offer rather than the balance, so an older backend that omits them
 * must leave the wording without a number instead of inviting a hardcoded one
 * back in - which is how the phone came to advertise 100 free Vibes long after
 * the grant that funded them.
 */
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * One published usage window, or null when its figures cannot be read. Null is not
 * an empty window: a meter drawn from a missing payload says "no allowance", which
 * is the opposite of what an older backend actually means, so the meter is left
 * off the page entirely instead.
 */
function normalizeWindow(value: unknown, unit: 'hours' | 'days'): VibesWindow | null {
  const w = (value ?? {}) as Record<string, unknown>;
  const whole = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
  // The wire names the window's length after its unit ("hours": 5); a window that
  // has already been through here carries it as `span`. Both are read, for the
  // same reason `normalizeModel` reads both spellings of a reasoning ladder:
  // re-validating an already-normalized wallet must not quietly empty it.
  const span = whole(w[unit] ?? w.span); const used = whole(w.used); const limit = whole(w.limit);
  if (!span || !limit || used === null) return null;
  return { unit, span, used, limit, resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null };
}
/** Both windows, or none: half a pair of meters is worse than neither. */
export function normalizeLimits(value: unknown): VibesLimits | null {
  const l = (value ?? {}) as Record<string, unknown>;
  const session = normalizeWindow(l.session, 'hours');
  const week = normalizeWindow(l.week, 'days');
  return session && week ? { session, week } : null;
}

export function validateWallet(value: unknown): VibesWallet {
  const w = value as VibesWallet;
  if (!w || w.version !== 1 || !['available', 'held', 'total', 'paidAvailable', 'trialChatsRemaining'].every(key => {
    const n = w[key as keyof VibesWallet]; return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  }) || typeof w.accountToken !== 'string' || !Array.isArray(w.products)) throw new VibesError('Your balance could not be verified. Please refresh.', 502);
  // Entitlements describe an offer, not a balance, so an older backend that omits
  // them falls back to the floor instead of blocking the wallet entirely.
  const plans = (w.planEntitlements ?? {}) as Record<string, unknown>;
  return { ...w, entitlements: normalizeEntitlements(w.entitlements),
    trialCredits: count(w.trialCredits), trialChats: count(w.trialChats), trialChatCredits: count(w.trialChatCredits),
    planEntitlements: Object.fromEntries(Object.keys(plans).map(plan => [plan, normalizeEntitlements(plans[plan])])),
    remoteAccessLive: w.remoteAccessLive === true, limits: normalizeLimits(w.limits),
    usedProjects: typeof w.usedProjects === 'number' && w.usedProjects >= 0 ? w.usedProjects : 0 };
}
/**
 * One model as the picker needs it. The reasoning ladder is normalized here, at
 * the only boundary where the provider's own shape actually arrives: a backend
 * that forwards OpenRouter's `supported_efforts` untouched and one that already
 * sends a normalized `efforts` list both end up with the same model, so the
 * effort control cannot silently vanish because of a casing difference.
 */
export function normalizeModel(value: unknown): VibesModel {
  const model = (value ?? {}) as VibesModel & { reasoning?: unknown };
  const raw = model.reasoning as { efforts?: unknown } | undefined;
  const reasoning = raw && Array.isArray(raw.efforts) ? raw as VibesModel['reasoning'] : normalizeReasoning(raw);
  return { ...model, reasoning, created: typeof model.created === 'number' ? model.created : null };
}
export const normalizeModels = (value: unknown): VibesModel[] =>
  (Array.isArray(value) ? value : []).filter(model => model && typeof (model as VibesModel).id === 'string').map(normalizeModel);

/**
 * The body, whatever the server actually sent. A failure does not always arrive
 * as JSON - a missing route, a proxy error page and a gateway timeout are all
 * HTML - and parsing before the status was read threw, so every one of them
 * reached the store as `status: 0`, the code that means "we never heard back".
 * A rejection it should have settled looked retryable, and the 404 that releases
 * a lost send was never recognised. The shape stays the endpoint's own, checked
 * where it is read exactly as it was when this call was `r.json()`.
 */
async function parse(r: Response): Promise<any> {
  const text = await r.text().catch(() => '');
  try { const value: unknown = text ? JSON.parse(text) : null; return value && typeof value === 'object' ? value : {}; }
  catch { return {}; }
}
/** What to say when the server answered but its body explained nothing. */
function unexplained(status: number): string {
  if (status === 404 || status === 405) return 'Vibyra AI is not available on this server yet.';
  if (status === 429) return 'That was a lot at once. Please try again in a moment.';
  if (status >= 500) return 'Vibyra could not answer just now. Please try again.';
  return 'Vibes is temporarily unavailable.';
}
export function createVibesApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch): VibesApi {
  // `anonymous` calls are the public catalogue only: no account data is read or
  // written, so they must still answer before sign-in.
  const call = async (path: string, body?: unknown, anonymous = false) => {
    const identity = token();
    if (!identity && !anonymous) throw new VibesError('Sign in to use your Vibes.', 401);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const r = await fetcher(`${baseUrl.replace(/\/$/, '')}/api/vibes/${path}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(identity ? { Authorization: `Bearer ${identity}` } : {}), Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const data = await parse(r);
      if (!anonymous && identity !== token()) throw new VibesError('Your account changed. Please try again.', 401);
      if (!r.ok) throw new VibesError(data.error ?? data.message ?? unexplained(r.status), r.status);
      return data;
    } catch (error) {
      if (error instanceof VibesError) throw error;
      throw new VibesError('Connection interrupted. Your draft is safe. Refresh to check your request.', 0);
    } finally { clearTimeout(timeout); }
  };
  return {
    wallet: async () => validateWallet((await call('wallet')).wallet), consent: async () => { await call('consent', { accepted: true }); },
    models: async () => normalizeModels((await call('models', undefined, true)).models), chats: async () => (await call('chats')).chats,
    createChat: async (id, title) => (await call('chats', { id, title })).chats,
    quote: (chatId, text, model, effort, integrations) => call('quote', { chatId, text, model,
      ...(effort ? { effort } : {}), ...(integrations?.length ? { integrations } : {}) }),
    submit: async (id, quote) => (await call('turns', { id, quote })).turn,
    turn: async id => (await call(`turns/${encodeURIComponent(id)}`)).turn,
    turns: async id => (await call(`chats/${encodeURIComponent(id)}/turns`)).turns,
    cancel: async id => { await call(`turns/${encodeURIComponent(id)}/cancel`, {}); },
    purchase: async (transactionId, productId) => validateWallet((await call('purchases', { transactionId, productId })).wallet),
    attach: async (chatId, hostId, projectId, binding) => { await call('chats/' + chatId + '/project', { hostId, projectId, binding, shareProject: true }); },
    toolResult: async (toolId, decision, result) => { await call('tools/' + toolId + '/result', { decision, result }); },
  };
}
