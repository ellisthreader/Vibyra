import React from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { VibesScreen } from '../src/vibes/VibesScreen';
import { NavigationDrawer } from '../src/ui/NavigationDrawer';
import { VibesBalanceRow } from '../src/vibes/VibesBalanceRow';
import { WalletSheet } from '../src/vibes/WalletSheet';
import type { PurchaseBridge, VibesApi, VibesChat, VibesTurn, VibesWallet } from '../src/vibes/types';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light'; const colors = dark ? palettes.dark : palettes.light;
const calls: string[] = [];
Object.assign(window, { vibesCalls: calls });
const planEntitlements = {
  free: { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false },
  starter: { maxProjects: 3, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false },
  builder: { maxProjects: 10, concurrentReplies: 2, fullCatalogue: false, remoteAccess: false },
  pro: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true },
};
let wallet: VibesWallet = { version: 1, available: 100, held: 0, total: 100, paidAvailable: 0,
  plan: 'free', paidUntil: null, trialChatsRemaining: 2, accountToken: '8606d4d2-bae1-4d72-8aec-6f24b3c4a274',
  consented: query.get('state') !== 'consent', verified: true, purchasesEnabled: true, products: [
    { id: 'starter', plan: 'starter', credits: 350, pence: 2000, kind: 'subscription' },
    { id: 'builder', plan: 'builder', credits: 1000, pence: 4900, kind: 'subscription' },
    { id: 'pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' },
    { id: 'topup', plan: null, credits: 500, pence: 2000, kind: 'topup' },
  ], entitlements: planEntitlements.free, planEntitlements,
  remoteAccessLive: query.get('remote') === 'live', usedProjects: 0 };
let chats: VibesChat[] = []; const turns: VibesTurn[] = [];
// [slug, display name, tier, released] — real OpenRouter ids so the picker groups
// by the same vendor the live catalogue would report.
const catalogue = [
  ['openai/gpt-5.6-luna', 'GPT-5.6 Luna', 'newest', '2026-08-19'],
  ['anthropic/claude-sonnet-5', 'Sonnet 5', 'best', '2026-02-11'],
  ['google/gemini-3.8-flash', 'Gemini 3.8 Flash', 'fast', '2026-04-02'],
  ['x-ai/grok-4.6', 'Grok 4.6', 'best', '2026-03-05'],
  ['moonshotai/kimi-k2.7-code', 'Kimi K2.7 Code', 'newest', '2026-08-06'],
  ['deepseek/deepseek-v4-pro-0813', 'DeepSeek V4 Pro', 'newest', '2026-08-13'],
  ['qwen/qwen3.8-flash', 'Qwen3.8 Flash', 'fast', '2026-05-15'],
  ['minimax/minimax-m3', 'MiniMax M3', 'newest', '2026-07-28'],
  ['mistralai/devstral-2512', 'Devstral', 'newest', '2026-06-11'],
  ['meta-llama/llama-4-maverick', 'Llama 4 Maverick', 'value', '2025-04-05'],
] as const;
const api: VibesApi = {
  wallet: async () => ({ ...wallet }), chats: async () => [...chats],
  consent: async () => { wallet = { ...wallet, consented: true }; calls.push('consent'); },
  models: async () => catalogue.map(([id, name, tier, released], i) => ({ id, name, family: id.split('/')[0]!,
    available: true, trial: i % 2 === 0, inputPerMillion: 1, outputPerMillion: 4, tier, released,
    blurb: `${name} on OpenRouter.` })),
  createChat: async (id, title) => { chats = [{ id, title, trial_slot: null, trial_used: 0, host_id: 'fixture-host', project_id: 'fixture-project', binding: 'fixture-binding' }, ...chats]; return chats; },
  quote: async (chatId, text, model) => ({ quote: JSON.stringify({ chatId, text, model }), maxCredits: 5, estimatedCredits: 2, model, expiresAt: Date.now() / 1000 + 120 }),
  submit: async (id, quote) => {
    calls.push('submit');
    if (query.get('state') === 'failure') throw new Error('Connection interrupted. Your draft is saved.');
    const q = JSON.parse(quote); wallet = { ...wallet, available: 98, total: 98, trialChatsRemaining: 1 };
    const t: VibesTurn = { id, chatId: q.chatId, model: q.model, status: 'completed', prompt: q.text,
      response: 'Let’s start with one focused screen.\n\nKeep the main action easy to reach, use clear labels, and give the content room to breathe.',
      reserved: 5, charged: 2, error: null, createdAt: new Date().toISOString() };
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
// Mirrors the navigation rail's footer slot, where the balance is reachable from
// every screen rather than only from the AI home.
function Rail() {
  const [wallet, setWallet] = React.useState(false);
  return <>
    <VibesBalanceRow signedIn onWallet={() => setWallet(true)} onSignIn={() => calls.push('sign-in')} />
    <WalletSheet visible={wallet} onClose={() => setWallet(false)} />
  </>;
}
// The real rail, so the balance can be reviewed where it actually sits.
function Drawer() {
  const [wallet, setWallet] = React.useState(false);
  return <>
    <NavigationDrawer visible destination="work" workspace={workspace} onClose={() => {}}
      onNavigate={() => {}} onNew={() => {}}
      balance={<VibesBalanceRow signedIn onWallet={() => setWallet(true)} onSignIn={() => calls.push('sign-in')} />} />
    <WalletSheet visible={wallet} onClose={() => setWallet(false)} />
  </>;
}
createRoot(document.getElementById('root')!).render(<SafeAreaProvider>
  <ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginBottom: 10 }}>Economy UI test fixture</Text>
      <VibesProvider identity={workspace.account.email} api={api} purchases={purchases}>
        <VibesScreen workspace={workspace} onComputer={() => calls.push('computer')} />
        {query.get('rail') === '1' && <Rail />}
        {query.get('rail') === 'drawer' && <Drawer />}
      </VibesProvider>
    </View>
  </ThemeContext.Provider>
</SafeAreaProvider>);
