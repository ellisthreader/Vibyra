import type { VibesApi, VibesEntitlements, VibesWallet } from '../vibes/types';

// The sample workspace fabricates its projects and sessions, so it fabricates a
// wallet too rather than leaving the balance looking signed out. Purchases stay
// off: the sample can show what a plan includes, never sell one.
const entitlements: Record<string, VibesEntitlements> = {
  free: { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false },
  starter: { maxProjects: 3, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false },
  builder: { maxProjects: 10, concurrentReplies: 2, fullCatalogue: false, remoteAccess: false },
  pro: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true },
};
export const sampleWallet: VibesWallet = {
  version: 1, available: 100, held: 0, total: 100, paidAvailable: 0, chatEnabled: false,
  plan: 'free', paidUntil: null, trialChatsRemaining: 2, accountToken: 'sample-workspace',
  consented: true, verified: true, purchasesEnabled: false,
  products: [
    { id: 'sample.starter', plan: 'starter', credits: 350, pence: 2000, kind: 'subscription' },
    { id: 'sample.builder', plan: 'builder', credits: 1000, pence: 4900, kind: 'subscription' },
    { id: 'sample.pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' },
  ],
  entitlements: entitlements.free, planEntitlements: entitlements,
  remoteAccessLive: false, usedProjects: 0,
};
const unavailable = async (): Promise<never> => {
  throw new Error('This is a sample workspace. Sign in to use your own Vibes.');
};
export const sampleVibesApi: VibesApi = {
  wallet: async () => sampleWallet,
  models: async () => [],
  chats: async () => [],
  turns: async () => [],
  consent: async () => {},
  cancel: async () => {},
  createChat: unavailable,
  quote: unavailable,
  submit: unavailable,
  turn: unavailable,
  purchase: unavailable,
};
