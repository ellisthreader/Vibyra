import type { VibesApi, VibesEntitlements, VibesWallet } from '../vibes/types';

// The sample workspace fabricates its projects and sessions, so it fabricates a
// wallet too rather than leaving the balance looking signed out. Purchases stay
// off: the sample can show what a plan includes, never sell one.
const entitlements: Record<string, VibesEntitlements> = {
  free: { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false, sessionCredits: 60, weekCredits: 150 },
  starter: { maxProjects: 3, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false, sessionCredits: 70, weekCredits: 175 },
  builder: { maxProjects: 10, concurrentReplies: 2, fullCatalogue: false, remoteAccess: false, sessionCredits: 200, weekCredits: 500 },
  pro: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true, sessionCredits: 400, weekCredits: 1000 },
};
export const sampleWallet: VibesWallet = {
  version: 1, available: 3, held: 0, total: 3, paidAvailable: 0, chatEnabled: false,
  plan: 'free', paidUntil: null, trialChatsRemaining: 2, accountToken: 'sample-workspace',
  // The trial as `config/vibes.php` grants it, so the sample workspace and the
  // screenshots taken from it show the offer a real free account actually gets.
  trialCredits: 3, trialChats: 2, trialChatCredits: 3,
  consented: true, verified: true, purchasesEnabled: false,
  products: [
    { id: 'sample.starter', plan: 'starter', credits: 350, pence: 2000, kind: 'subscription' },
    { id: 'sample.builder', plan: 'builder', credits: 1000, pence: 4900, kind: 'subscription' },
    { id: 'sample.pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' },
  ],
  entitlements: entitlements.free, planEntitlements: entitlements,
  remoteAccessLive: false, usedProjects: 0,
  // The windows as `config/vibes.php` sizes them for Free, so a screenshot of the
  // sample shows the meters a real free account sees rather than an empty page.
  limits: {
    session: { unit: 'hours', span: 5, used: 0, limit: 60, resetsAt: null },
    week: { unit: 'days', span: 7, used: 0, limit: 150, resetsAt: null },
  },
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
