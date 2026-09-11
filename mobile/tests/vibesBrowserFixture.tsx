import React from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { normalizeModels } from '../src/vibes/api';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { VibesScreen } from '../src/vibes/VibesScreen';
import { WalletScreen } from '../src/vibes/WalletScreen';
import type { PurchaseBridge, VibesApi, VibesChat, VibesTurn, VibesWallet } from '../src/vibes/types';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light'; const colors = dark ? palettes.dark : palettes.light;
const calls: string[] = [];
// Kept apart from `calls` so the ordering assertions elsewhere stay about which
// operations ran, while these stay about what was actually asked of the provider.
const efforts: string[] = [];
Object.assign(window, { vibesCalls: calls, vibesEfforts: efforts });
const planEntitlements = {
  free: { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false },
  starter: { maxProjects: 3, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false },
  builder: { maxProjects: 10, concurrentReplies: 2, fullCatalogue: false, remoteAccess: false },
  pro: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true },
};
let wallet: VibesWallet = { version: 1, available: 3, held: 0, total: 3, paidAvailable: 0,
  plan: 'free', paidUntil: null, trialChatsRemaining: 2, trialCredits: 3, trialChats: 2, trialChatCredits: 3,
  accountToken: '8606d4d2-bae1-4d72-8aec-6f24b3c4a274',
  consented: query.get('state') !== 'consent', verified: true, purchasesEnabled: true, products: [
    { id: 'starter', plan: 'starter', credits: 350, pence: 2000, kind: 'subscription' },
    { id: 'builder', plan: 'builder', credits: 1000, pence: 4900, kind: 'subscription' },
    { id: 'pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' },
    { id: 'topup', plan: null, credits: 500, pence: 2000, kind: 'topup' },
  ], entitlements: planEntitlements.free, planEntitlements,
  remoteAccessLive: query.get('remote') === 'live', usedProjects: 0 };
let chats: VibesChat[] = []; const turns: VibesTurn[] = [];
// Dates are relative so a "New" badge assertion cannot quietly stop holding a few
// weeks from now, which a hardcoded release date would.
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
// [slug, display name, tier, days since release, efforts] — real OpenRouter ids and
// real ladders, so the picker groups by the vendor and offers the levels the live
// catalogue would. An empty ladder is a model whose thinking cannot be steered.
const catalogue = [
  ['openai/gpt-5.6-luna', 'GPT-5.6 Luna', 'newest', 4, ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
  ['anthropic/claude-sonnet-5', 'Sonnet 5', 'best', 210, ['low', 'medium', 'high', 'xhigh', 'max']],
  ['google/gemini-3.8-flash', 'Gemini 3.8 Flash', 'fast', 160, ['low', 'medium', 'high']],
  ['x-ai/grok-4.6', 'Grok 4.6', 'best', 188, ['low', 'medium', 'high', 'xhigh']],
  ['moonshotai/kimi-k2.7-code', 'Kimi K2.7 Code', 'newest', 34, []],
  ['deepseek/deepseek-v4-pro-0813', 'DeepSeek V4 Pro', 'newest', 27, ['low', 'high', 'max']],
  ['qwen/qwen3.8-flash', 'Qwen3.8 Flash', 'fast', 117, []],
  ['minimax/minimax-m3', 'MiniMax M3', 'newest', 43, []],
  ['mistralai/devstral-2512', 'Devstral', 'newest', 90, []],
  // Two Meta slugs that must collapse into one company card.
  ['meta-llama/llama-4-maverick', 'Llama 4 Maverick', 'value', 520, []],
  ['meta/muse-1', 'Muse 1', undefined, 12, []],
] as const;
const api: VibesApi = {
  wallet: async () => ({ ...wallet }), chats: async () => [...chats],
  consent: async () => { wallet = { ...wallet, consented: true }; calls.push('consent'); },
  // Deliberately the raw provider shape, so the fixture proves the normalization
  // the real backend payload goes through rather than bypassing it.
  models: async () => normalizeModels(catalogue.map(([id, name, tier, age, efforts], i) => ({ id, name,
    family: id.split('/')[0]!, available: true, trial: i % 2 === 0, inputPerMillion: 1, outputPerMillion: 4,
    tier, released: daysAgo(age), blurb: `${name} on OpenRouter.`,
    reasoning: efforts.length ? { mandatory: false, default_effort: 'high', supported_efforts: [...efforts].reverse() } : undefined }))),
  createChat: async (id, title) => { chats = [{ id, title, trial_slot: null, trial_used: 0, host_id: 'fixture-host', project_id: 'fixture-project', binding: 'fixture-binding' }, ...chats]; return chats; },
  // The effort is recorded on the quote and echoed back, so a test can prove the
  // level that was chosen is the level that would actually be paid for.
  quote: async (chatId, text, model, effort) => { efforts.push('quote:' + model + ':' + (effort ?? 'default'));
    // Sized against the trial the wallet above holds: a free account has to be able
    // to afford its first reply, or every flow past the composer is untestable.
    return { quote: JSON.stringify({ chatId, text, model, effort }), maxCredits: effort === 'max' ? 3 : 2,
      estimatedCredits: 1, model, effort: effort ?? null, expiresAt: Date.now() / 1000 + 120 }; },
  submit: async (id, quote) => {
    calls.push('submit'); efforts.push('submit:' + (JSON.parse(quote).effort ?? 'default'));
    if (query.get('state') === 'failure') throw new Error('Connection interrupted. Your draft is saved.');
    const q = JSON.parse(quote); wallet = { ...wallet, available: 1, total: 1, trialChatsRemaining: 1 };
    const t: VibesTurn = { id, chatId: q.chatId, model: q.model, status: 'completed', prompt: q.text,
      response: 'Let’s start with one focused screen.\n\nKeep the main action easy to reach, use clear labels, and give the content room to breathe.',
      reserved: 2, charged: 1, error: null, createdAt: new Date().toISOString() };
    if (['edit', 'offline'].includes(query.get('state') ?? '')) {
      t.status = 'waiting'; t.response = null;
      t.tools = [{ id: 'edit-one', expiresAt: Date.now() / 1000 + 900, operation: 'write_file',
        arguments: { path: 'src/welcome.ts', content: 'export const greeting = "Build from your pocket.";\n', expectedSha256: 'new' }, decision: null, result: null }];
    }
    turns.push(t); return t;
  },
  turns: async id => turns.filter(t => t.chatId === id), turn: async id => turns.find(t => t.id === id)!, cancel: async () => {},
  purchase: async (_id, product) => {
    calls.push('verify'); const p = wallet.products.find(p => p.id === product)!;
    const plan = p.plan ?? wallet.plan;
    wallet = { ...wallet, plan, entitlements: planEntitlements[plan as keyof typeof planEntitlements] ?? wallet.entitlements,
      paidUntil: p.kind === 'subscription' ? '2026-10-09T00:00:00Z' : wallet.paidUntil,
      available: wallet.available + p.credits, paidAvailable: wallet.paidAvailable + p.credits };
    return wallet;
  },
  toolResult: async (_id, decision, result) => {
    calls.push('result'); const t = turns.at(-1)!; t.tools![0] = { ...t.tools![0], decision, result };
    t.status = 'completed'; t.response = decision === 'allow' ? 'The file is saved.' : 'I left your file unchanged.';
  },
};
const purchases: PurchaseBridge = {
  products: async () => [{ id: 'starter', displayPrice: '£20.00' }, { id: 'builder', displayPrice: '£49.00' },
    { id: 'pro', displayPrice: '£99.00' }, { id: 'topup', displayPrice: '£20.00' }],
  buy: async productId => { calls.push('buy'); await new Promise(resolve => setTimeout(resolve, 250));
    return query.get('purchase') === 'cancel' ? null : { productId, transactionId: '10001' }; },
  finish: async () => { calls.push('finish'); }, pending: async () => [], restore: async () => [],
};
const workspace = { ...fixtureWorkspace, status: query.get('state') === 'offline' ? 'offline' as const : 'connected' as const,
  account: { name: 'Design fixture', email: 'vibes-fixture@example.test', plan: 'free' },
  actions: { ...fixtureWorkspace.actions, vibesProjectRequest: async (_method: string, p: Record<string, unknown>) => {
    calls.push(String(p.decision)); return p.decision === 'allow' ? { written: true } : { declined: true };
  } } };
// The chip's destination, so this fixture can prove where the balance goes without
// re-testing the page. The page itself has `tests/walletBrowserFixture.tsx`.
function Harness() {
  const [page, setPage] = React.useState(query.get('page') === 'wallet');
  return <>
    {page ? <WalletScreen signedIn onSignIn={() => calls.push('sign-in')} onClose={() => setPage(false)} />
      : <VibesScreen workspace={workspace} onComputer={() => calls.push('computer')} onWallet={() => setPage(true)} />}
    {/* Stands in for the app's own way back: the rail and the header's new chat. */}
    {page && <Pressable accessibilityRole="button" accessibilityLabel="Back to chat" onPress={() => setPage(false)}
      style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.accent, fontSize: 13 }}>Back to chat</Text></Pressable>}
  </>;
}
createRoot(document.getElementById('root')!).render(<SafeAreaProvider>
  <ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginBottom: 10 }}>Economy UI test fixture</Text>
      <VibesProvider identity={workspace.account.email} api={api} purchases={purchases}>
        <Harness />
      </VibesProvider>
    </View>
  </ThemeContext.Provider>
</SafeAreaProvider>);
