import { normalizeReasoning } from '../ui/effort';
import { identified, objectValue, requiredList, requiredObject } from '../transport/responseShape';
import { apiUrl, requestJson } from '../transport/requestJson';
import type { VibesApi, VibesAttachment, VibesChat, VibesEntitlements, VibesLimits, VibesModel, VibesQuote, VibesTurn, VibesWallet, VibesWindow } from './types';

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
  return { ...w, guest: w.guest === true, entitlements: normalizeEntitlements(w.entitlements),
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
  return { ...model, reasoning, created: typeof model.created === 'number' ? model.created : null, vision: model.vision === true };
}
export const normalizeModels = (value: unknown): VibesModel[] =>
  (Array.isArray(value) ? value : []).filter(model => model && typeof (model as VibesModel).id === 'string').map(normalizeModel);
const chat = (value: unknown) => objectValue(value) && typeof value.id === 'string' && typeof value.title === 'string';
const turn = (value: unknown) => objectValue(value) && typeof value.id === 'string'
  && typeof value.chatId === 'string' && typeof value.status === 'string';
const quote = (value: unknown) => requiredObject<VibesQuote>(value, 'AI quote', item =>
  typeof item.quote === 'string' && typeof item.model === 'string'
  && typeof item.maxCredits === 'number' && typeof item.expiresAt === 'number');

/** What to say when the server answered but its body explained nothing. */
function unexplained(status: number): string {
  if (status === 404 || status === 405) return 'Vibyra AI is not available on this server yet.';
  if (status === 429) return 'That was a lot at once. Please try again in a moment.';
  if (status >= 500) return 'Vibyra could not answer just now. Please try again.';
  return 'Vibes is temporarily unavailable.';
}
export function createVibesApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch): VibesApi {
  let guestToken: string | null = null;
  // Anonymous calls are the public catalogue and the one-time guest bootstrap;
  // neither may require a session that does not exist yet.
  const call = async (path: string, body?: unknown, anonymous = false) => {
    const identity = token() ?? guestToken;
    if (!identity && !anonymous) throw new VibesError('Sign in to use your Vibes.', 401);
    // An upload is a form, sets its own boundary and is given longer on mobile data.
    const form = typeof FormData !== 'undefined' && body instanceof FormData ? body : null;
    try {
      const { response: r, data } = await requestJson(fetcher, apiUrl(baseUrl, `vibes/${path}`), { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(identity ? { Authorization: `Bearer ${identity}` } : {}), Accept: 'application/json',
          ...(form ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : form ?? JSON.stringify(body) }, form ? 60000 : 25000);
      if (!anonymous && identity !== (token() ?? guestToken)) throw new VibesError('Your account changed. Please try again.', 401);
      // A server without the Vibes routes still answers in JSON, with Laravel's own
      // sentence for developers ("The POST method is not supported for route…") in
      // `message`. The Vibes endpoints write theirs in `error`, so for a missing route
      // only that is shown; anything else falls back to saying what actually happened.
      const missing = r.status === 404 || r.status === 405;
      if (!r.ok) throw new VibesError(data.error ?? (missing ? undefined : data.message) ?? unexplained(r.status), r.status);
      return data;
    } catch (error) {
      if (error instanceof VibesError) throw error;
      throw new VibesError('Connection interrupted. Your draft is safe. Refresh to check your request.', 0);
    }
  };
  return {
    guest: {
      restore: value => { guestToken = value; },
      create: async (installId, deviceToken) => {
        const data = await call('guest', { installId, ...(deviceToken ? { deviceToken } : {}) }, true);
        if (typeof data.token !== 'string' || !data.token) throw new VibesError('Vibyra returned an unexpected guest session.', 502);
        const wallet = validateWallet(data.wallet); guestToken = data.token;
        return { token: data.token, wallet };
      },
    },
    prepareAuto: async (id, text) => requiredObject(await call('auto-preparations', { id, quote: text }), 'Auto preparation',
      item => typeof item.id === 'string' && typeof item.state === 'string'),
    autoPreparation: async id => requiredObject(await call(`auto-preparations/${encodeURIComponent(id)}`), 'Auto preparation',
      item => typeof item.id === 'string' && typeof item.state === 'string'),
    wallet: async () => validateWallet((await call('wallet')).wallet), consent: async () => { await call('consent', { accepted: true }); },
    models: async () => normalizeModels(requiredList((await call('models', undefined, true)).models, 'AI models', identified)),
    chats: async () => requiredList<VibesChat>((await call('chats')).chats, 'AI chats', chat),
    createChat: async (id, title) => requiredList<VibesChat>((await call('chats', { id, title })).chats, 'AI chats', chat),
    quote: async (chatId, text, model, effort, integrations, attachments) => quote(await call('quote', { chatId, text, model,
      ...(effort ? { effort } : {}), ...(integrations?.length ? { integrations } : {}), ...(attachments?.length ? { attachments } : {}) })),
    upload: async source => {
      const form = new FormData();
      // The browser sends the File itself; React Native reads the file at `uri`.
      form.append('file', (source.file ?? { uri: source.uri, name: source.name, type: source.mimeType }) as Blob, source.name);
      return requiredObject<VibesAttachment>((await call('attachments', form)).attachment, 'AI attachment',
        item => typeof item.id === 'string' && typeof item.kind === 'string');
    },
    submit: async (id, token) => requiredObject<VibesTurn>((await call('turns', { id, quote: token })).turn, 'AI turn', turn),
    turn: async id => requiredObject<VibesTurn>((await call(`turns/${encodeURIComponent(id)}`)).turn, 'AI turn', turn),
    turns: async id => requiredList<VibesTurn>((await call(`chats/${encodeURIComponent(id)}/turns`)).turns, 'AI turns', turn),
    cancel: async id => { await call(`turns/${encodeURIComponent(id)}/cancel`, {}); },
    purchase: async (transactionId, productId) => validateWallet((await call('purchases', { transactionId, productId })).wallet),
    attach: async (chatId, hostId, projectId, binding) => { await call('chats/' + chatId + '/project', { hostId, projectId, binding, shareProject: true }); },
    toolResult: async (toolId, decision, result) => { await call('tools/' + toolId + '/result', { decision, result }); },
  };
}
