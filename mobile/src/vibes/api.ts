import type { VibesApi, VibesEntitlements, VibesWallet } from './types';

export class VibesError extends Error { constructor(message: string, readonly status: number) { super(message); } }
/** Smallest entitlement set. A backend that omits limits must never widen them here. */
const FLOOR: VibesEntitlements = { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false };
export function normalizeEntitlements(value: unknown): VibesEntitlements {
  const e = (value ?? {}) as Partial<VibesEntitlements>;
  const projects = e.maxProjects;
  return {
    maxProjects: projects === null ? null : typeof projects === 'number' && Number.isSafeInteger(projects) && projects > 0 ? projects : FLOOR.maxProjects,
    concurrentReplies: typeof e.concurrentReplies === 'number' && e.concurrentReplies >= 1 ? Math.floor(e.concurrentReplies) : FLOOR.concurrentReplies,
    fullCatalogue: e.fullCatalogue === true, remoteAccess: e.remoteAccess === true,
  };
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
    planEntitlements: Object.fromEntries(Object.keys(plans).map(plan => [plan, normalizeEntitlements(plans[plan])])),
    remoteAccessLive: w.remoteAccessLive === true,
    usedProjects: typeof w.usedProjects === 'number' && w.usedProjects >= 0 ? w.usedProjects : 0 };
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
      const data = await r.json();
      if (!anonymous && identity !== token()) throw new VibesError('Your account changed. Please try again.', 401);
      if (!r.ok) throw new VibesError(data.error ?? data.message ?? 'Vibes is temporarily unavailable.', r.status);
      return data;
    } catch (error) {
      if (error instanceof VibesError) throw error;
      throw new VibesError('Connection interrupted. Your draft is safe. Refresh to check your request.', 0);
    } finally { clearTimeout(timeout); }
  };
  return {
    wallet: async () => validateWallet((await call('wallet')).wallet), consent: async () => { await call('consent', { accepted: true }); },
    models: async () => (await call('models', undefined, true)).models, chats: async () => (await call('chats')).chats,
    createChat: async (id, title) => (await call('chats', { id, title })).chats,
    quote: (chatId, text, model) => call('quote', { chatId, text, model }),
    submit: async (id, quote) => (await call('turns', { id, quote })).turn,
    turn: async id => (await call(`turns/${encodeURIComponent(id)}`)).turn,
    turns: async id => (await call(`chats/${encodeURIComponent(id)}/turns`)).turns,
    cancel: async id => { await call(`turns/${encodeURIComponent(id)}/cancel`, {}); },
    purchase: async (transactionId, productId) => validateWallet((await call('purchases', { transactionId, productId })).wallet),
    attach: async (chatId, hostId, projectId, binding) => { await call('chats/' + chatId + '/project', { hostId, projectId, binding, shareProject: true }); },
    toolResult: async (toolId, decision, result) => { await call('tools/' + toolId + '/result', { decision, result }); },
  };
}
