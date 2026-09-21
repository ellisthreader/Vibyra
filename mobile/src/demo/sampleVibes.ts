import { fallbackModels } from '../vibes/catalogue';
import type { AttachmentSource, VibesApi, VibesAttachment, VibesChat, VibesEntitlements, VibesTurn, VibesWallet } from '../vibes/types';

// The sample workspace fabricates its projects and sessions, so it fabricates a
// wallet too rather than leaving the balance looking signed out. Purchases stay
// off: the sample can show what a plan includes, never sell one.
const entitlements: Record<string, VibesEntitlements> = {
  free: { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false, sessionCredits: 60, weekCredits: 150 },
  starter: { maxProjects: 3, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false, sessionCredits: 70, weekCredits: 175 },
  // Pro 10×: Pro's entitlements, half its Vibes, as `config/vibes.plans` has it.
  builder: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true, sessionCredits: 200, weekCredits: 500 },
  pro: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true, sessionCredits: 400, weekCredits: 1000 },
};
export const sampleWallet: VibesWallet = {
  // The chat is on here. It is the sample's own chat, answered in this file and
  // never sent anywhere, so switching it off would only show the test account a
  // "being prepared" notice for a server it is not talking to.
  version: 1, available: 3, held: 0, total: 3, paidAvailable: 0, chatEnabled: true,
  plan: 'free', paidUntil: null, trialChatsRemaining: 2, accountToken: 'sample-workspace',
  // The trial as `config/vibes.php` grants it, so the sample workspace and the
  // screenshots taken from it show the offer a real free account actually gets.
  trialCredits: 3, trialChats: 2, trialChatCredits: 3,
  consented: true, verified: true, guest: false, purchasesEnabled: false,
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

/**
 * The sample chat's own state, held exactly the way `useDemoWorkspace` holds the
 * sample terminals and sessions: in memory, never on a server, and forgotten on the
 * way out (`resetSampleVibes`, called by every exit from the sample).
 */
let wallet: VibesWallet = sampleWallet;
let chats: VibesChat[] = [];
let turns: VibesTurn[] = [];
let uploads: VibesAttachment[] = [];
let serial = 0;
export function resetSampleVibes() { wallet = sampleWallet; chats = []; turns = []; uploads = []; serial = 0; }

const model = (id: string) => fallbackModels.find(entry => entry.id === id) ?? fallbackModels[0]!;
// Auto, answered the way the server's router answers it: what the turn asks for
// picks the model, and one sentence names the axis that decided. The sentences are
// `Vibes\Auto\Decision::explain`'s own, so the composer reads here exactly as it
// reads in production. Only trial-funded models are candidates, because a free
// wallet is what the sample holds and the real router weighs the same limit.
const DELIBERATE = /\b(why|debug|plan|refactor|architecture|failing|broken|migrate)\b/i;
function route(text: string) {
  if (DELIBERATE.test(text)) return { chosen: model('deepseek/deepseek-v4-pro-0813'), reason: 'Chosen to think this one through before answering.' };
  if (text.trim().split(/\s+/).length > 60) return { chosen: model('openai/gpt-5.6-luna'), reason: 'Chosen for the amount of context this turn has to hold.' };
  return { chosen: model('qwen/qwen3.8-flash'), reason: 'A quick, inexpensive model for a straightforward turn.' };
}
// A ceiling sized off the draft, the way a real quote is sized off the turn, and
// never past what this chat's trial can pay for.
const price = (text: string) => Math.min(3, 1 + Math.floor(text.trim().length / 180));

/**
 * The sample's reply. The sample workspace answers its terminals and its computer
 * chats with a plausible answer and lets the header's "Sample workspace" say what
 * it is; this does the same, and closes with the one line a person needs to know.
 * It answers a question about something wrong differently from a question about
 * something to build, because one reply for both is how a sample stops reading as
 * an answer at all.
 */
function reply(text: string) {
  const ask = text.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').slice(0, 70);
  const [opening, body] = DELIBERATE.test(text)
    ? ['Work back from the last thing that changed.',
      `For “${ask}”: reproduce it once, write down what you expected, then cut the input down until the smallest one still gets it wrong.`
      + ' Fix the cause you can name, and leave behind the test that would have caught it.']
    : ['Start with one screen and one clear action.',
      `For “${ask}”: keep it to a single column, give the main action the most weight, and let everything else stay quiet.`
      + ' Name each step in your own words, and show what changed the moment it changes.'];
  return `${opening}\n\n${body}\n\nThis is the sample workspace, so nothing was sent to a model.`
    + ' Sign in to your own account to run it for real.';
}

// A chat the sample has forgotten - the phone remembers which one was open, the
// sample does not - is made again rather than refused, so a reopened sample picks
// up on an ordinary empty chat instead of an estimate that cannot be loaded.
function ensureChat(id: string, title = 'New chat') {
  const known = chats.find(chat => chat.id === id);
  if (known) return known;
  const chat: VibesChat = { id, title, trial_slot: wallet.trialChatsRemaining > 0 ? chats.length + 1 : null, trial_used: 0 };
  chats = [chat, ...chats];
  if (chat.trial_slot) wallet = { ...wallet, trialChatsRemaining: wallet.trialChatsRemaining - 1 };
  return chat;
}
const unavailable = async (): Promise<never> => {
  throw new Error('This is a sample workspace. Sign in to use your own Vibes.');
};
export const sampleVibesApi: VibesApi = {
  wallet: async () => wallet,
  // Nothing here, on purpose: the shipped catalogue is what fills the picker
  // without a server, and the sample is one of the runtimes that proves it.
  models: async () => [],
  chats: async () => [...chats],
  consent: async () => { wallet = { ...wallet, consented: true }; },
  cancel: async () => {},
  createChat: async (id, title) => { ensureChat(id, title); return [...chats]; },
  quote: async (chatId, text, id, effort, _integrations, attached = []) => {
    const chat = ensureChat(chatId, text);
    const auto = id === 'auto';
    const { chosen, reason } = auto ? route(text) : { chosen: model(id), reason: '' };
    const maxCredits = Math.min(price(text), Math.max(1, wallet.available));
    return {
      quote: JSON.stringify({ chatId: chat.id, text, model: chosen.id, maxCredits, attachments: attached }),
      maxCredits, estimatedCredits: Math.max(1, maxCredits - 1), model: chosen.id,
      expiresAt: Date.now() / 1000 + 120,
      effort: auto ? chosen.reasoning?.defaultEffort ?? null : effort ?? chosen.reasoning?.defaultEffort ?? null,
      auto: auto ? { name: chosen.name, reason } : null,
    };
  },
  // The sample keeps a photo the way the chat does: long enough to show it in the
  // message it went with. It never leaves the phone.
  upload: async (source: AttachmentSource) => {
    const attachment: VibesAttachment = { id: `sample-attachment-${++serial}`, name: source.name, bytes: 0,
      kind: source.mimeType.startsWith('image/') ? 'image' : source.mimeType === 'application/pdf' ? 'pdf' : 'text' };
    uploads = [...uploads, attachment];
    return attachment;
  },
  submit: async (id, quote) => {
    const q = JSON.parse(quote) as { chatId: string; text: string; model: string; maxCredits: number; attachments: string[] };
    const chat = ensureChat(q.chatId, q.text);
    const charged = Math.max(1, q.maxCredits - 1);
    const turn: VibesTurn = { id, chatId: chat.id, model: q.model, status: 'completed', prompt: q.text,
      response: reply(q.text), reserved: q.maxCredits, charged, error: null, createdAt: new Date().toISOString(),
      attachments: q.attachments.flatMap(attached => uploads.filter(upload => upload.id === attached)) };
    turns = [...turns, turn];
    chats = chats.map(entry => entry.id === chat.id
      ? { ...entry, trial_used: entry.trial_slot ? entry.trial_used + charged : entry.trial_used } : entry);
    const available = wallet.available - charged;
    // The balance moves, so the sample shows what a reply costs. It refills when it
    // would run out, because there is nothing to buy in a sample: a demo that can be
    // spent empty stops demonstrating the thing it exists to demonstrate.
    wallet = available >= 1 ? { ...wallet, available, total: wallet.total - charged }
      : { ...wallet, available: sampleWallet.available, total: sampleWallet.total };
    return turn;
  },
  turn: async id => {
    const turn = turns.find(entry => entry.id === id);
    if (!turn) throw new Error('That reply is no longer in this sample.');
    return turn;
  },
  turns: async chatId => turns.filter(turn => turn.chatId === chatId),
  purchase: unavailable,
};
