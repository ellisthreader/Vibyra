import React from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import type { WorkspaceModel } from '../src/ui/types';
import { DrawerBalance } from '../src/vibes/DrawerBalance';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { VibesSettingsPage } from '../src/vibes/VibesSettingsPage';
import { WalletScreen } from '../src/vibes/WalletScreen';
import type { PurchaseBridge, VibesApi, VibesWallet } from '../src/vibes/types';

/**
 * The Vibes page on its own. It has a fixture separate from the AI home's so a
 * change to the composer, the model picker or a chat cannot break the proof that
 * the balance and the upgrade still work.
 */
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light'; const colors = dark ? palettes.dark : palettes.light;
const calls: string[] = [];
Object.assign(window, { walletCalls: calls });
const planEntitlements = {
  free: { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false, sessionCredits: 60, weekCredits: 150 },
  starter: { maxProjects: 3, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false, sessionCredits: 70, weekCredits: 175 },
  // Pro 10×: Pro's entitlements, half its Vibes, as `config/vibes.plans` has it.
  builder: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true, sessionCredits: 200, weekCredits: 500 },
  pro: { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true, sessionCredits: 400, weekCredits: 1000 },
};
// `used=` drives the two meters, so the full and nearly-full states are drivable
// without a clock: `full` puts the session over its own limit an hour ago.
const used = Number(query.get('used') ?? 0);
const full = query.get('used') === 'full';
const plan = query.get('plan') ?? 'free';
const entitled = planEntitlements[plan as keyof typeof planEntitlements] ?? planEntitlements.free;
const available = plan === 'free' ? 3 : 1240;
let wallet: VibesWallet = { version: 1, available, held: Number(query.get('held') ?? 0),
  total: available + Number(query.get('held') ?? 0), paidAvailable: plan === 'free' ? 0 : 1000, plan, trialChatsRemaining: 2,
  // The trial is the backend's to define, and every reader words itself from
  // these rather than keeping a number of its own.
  trialCredits: 3, trialChats: 2, trialChatCredits: 3,
  paidUntil: plan === 'free' ? null : '2026-10-09T00:00:00Z',
  accountToken: '8606d4d2-bae1-4d72-8aec-6f24b3c4a274', consented: true, verified: true,
  purchasesEnabled: query.get('purchases') !== 'off', products: [
    { id: 'starter', plan: 'starter', credits: 350, pence: 2000, kind: 'subscription' },
    { id: 'builder', plan: 'builder', credits: 1000, pence: 4900, kind: 'subscription' },
    { id: 'pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' },
    { id: 'topup', plan: null, credits: 500, pence: 2000, kind: 'topup' },
  ], entitlements: planEntitlements[plan as keyof typeof planEntitlements] ?? planEntitlements.free,
  planEntitlements, remoteAccessLive: query.get('remote') === 'live',
  usedProjects: Number(query.get('projects') ?? 0),
  // Sized from the plan being pretended, so a screenshot shows the windows that
  // plan really has rather than one plan's balance under another plan's rate.
  limits: query.get('limits') === 'off' ? null : {
    // `resetsAt` follows spend, as the backend's does: it is the moment the oldest
    // turn in the window ages out, so it exists whenever anything is in the window
    // and is null only while the window is untouched.
    session: { unit: 'hours', span: 5, used: full ? entitled.sessionCredits : used, limit: entitled.sessionCredits,
      resetsAt: full || used > 0 ? new Date(Date.now() + 4 * 3600_000).toISOString() : null },
    week: { unit: 'days', span: 7, used: full ? Math.round(entitled.weekCredits * 0.64) : used,
      limit: entitled.weekCredits, resetsAt: full || used > 0 ? new Date(Date.now() + 3 * 86400_000).toISOString() : null },
  } };
const unused = async () => { throw new Error('the balance page makes no chat calls'); };
const api: VibesApi = {
  wallet: async () => { calls.push('wallet'); return { ...wallet }; },
  models: async () => [], chats: async () => [], consent: unused,
  createChat: unused, quote: unused, submit: unused, turn: unused, turns: async () => [], cancel: unused,
  purchase: async (_transaction, product) => {
    calls.push('verify'); const bought = wallet.products.find(p => p.id === product)!;
    const next = bought.plan ?? wallet.plan;
    const gained = planEntitlements[next as keyof typeof planEntitlements] ?? wallet.entitlements;
    wallet = { ...wallet, plan: next, entitlements: gained,
      paidUntil: bought.kind === 'subscription' ? '2026-10-09T00:00:00Z' : wallet.paidUntil,
      total: wallet.total + bought.credits, available: wallet.available + bought.credits, paidAvailable: wallet.paidAvailable + bought.credits,
      // The windows widen with the plan, exactly as `Wallet::payload` re-derives
      // them from the entitled plan on the next read. A fixture that left them at
      // the old plan's figures would prove the meters never move when money does.
      limits: wallet.limits && { session: { ...wallet.limits.session, limit: gained.sessionCredits },
        week: { ...wallet.limits.week, limit: gained.weekCredits } } };
    return wallet;
  },
};
let priceRequests = 0;
const purchases: PurchaseBridge | null = query.get('bridge') === 'off' ? null : {
  products: async () => {
    if (query.get('prices') === 'retry' && priceRequests++ < 2) throw new Error('Store unavailable');
    return [{ id: 'starter', displayPrice: '£20.00' }, { id: 'builder', displayPrice: '£49.00' },
      { id: 'pro', displayPrice: '£99.00' }, { id: 'topup', displayPrice: '£20.00' }];
  },
  buy: async productId => { calls.push('buy'); await new Promise(resolve => setTimeout(resolve, 200));
    return query.get('purchase') === 'cancel' ? null : { productId, transactionId: '10001' }; },
  finish: async () => { calls.push('finish'); }, pending: async () => [], restore: async () => [],
};
const account = { name: 'Design fixture', email: 'wallet-fixture@example.test', plan };
// `signedIn=0` drops the identity too, exactly as the app does: `VibesProvider` is
// handed `workspace.account?.email ?? null`, so a signed-out phone asks for no
// wallet at all. A fixture that kept the identity would poll one and prove nothing.
const identity = query.get('signedIn') === '0' ? null : account.email;

// The balance is Vibyra tokens, a page of the Settings sheet; the upgrade is the
// `vibes` destination it opens, which hands back to the balance with Back or a
// finished purchase and leaves the area with its X. `entry=1` starts on the rail's
// balance pill, which is how the page is reached without going through Settings.
const signedIn = query.get('signedIn') !== '0';
const workspace = { account: signedIn ? account : null } as unknown as WorkspaceModel;
type Place = 'rail' | 'settings' | 'upgrade';
function Harness() {
  const home: Place = query.get('entry') === '1' ? 'rail' : 'settings';
  const [view, setView] = React.useState<Place>(home);
  const nav = { push() {}, back() {}, close: (then?: () => void) => then?.(), signIn: () => calls.push('sign-in') };
  if (view === 'upgrade') return <WalletScreen signedIn={signedIn} onSignIn={() => calls.push('sign-in')}
    onBack={() => setView('settings')} onClose={() => { calls.push('close'); setView(home); }} />;
  if (view === 'settings') return <View style={{ flex: 1, backgroundColor: colors.rail, paddingTop: 24 }}>
    <VibesSettingsPage workspace={workspace} nav={nav}
      routes={{ wallet: () => setView('upgrade'), plugins() {}, remote() {}, connect() {} }}
      onSignIn={() => calls.push('sign-in')} />
  </View>;
  return <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end', padding: 16, backgroundColor: colors.rail }}>
    <DrawerBalance onPress={() => setView('settings')} />
  </View>;
}
// The inset the page is actually drawn under. Left at zero, this fixture proved
// the light against a screen no phone has: `Wash` reached the top of the viewport
// here, while on device it began below the status bar, on a visible line. Sized
// from the viewport so both verified devices get their own — a notched phone's
// 59pt, and the small one's 20pt status bar — and overridable with `inset=`.
const inset = Number(query.get('inset') ?? (window.innerHeight >= 800 ? 59 : 20));
const fixtureFrame = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
const fixtureInsets = { top: inset, left: 0, right: 0, bottom: inset >= 59 ? 34 : 0 };
// Pinned rather than handed to `initialMetrics`, which a browser discards: the web
// provider measures `env(safe-area-inset-*)` off a real element on mount and posts
// the result over whatever it started with, and a headless Chrome has no insets to
// find. The contexts it would have written are supplied here instead, so the page
// reads the phone's numbers however the measurement turns out.
createRoot(document.getElementById('root')!).render(<SafeAreaProvider>
  <SafeAreaFrameContext.Provider value={fixtureFrame}>
    <SafeAreaInsetsContext.Provider value={fixtureInsets}>
      <ThemeContext.Provider value={{ colors, dark }}>
        {/* The bottom inset is the destination's `SafeAreaView`'s, which the upgrade
            page's pinned purchase sits above on a phone with a home indicator. */}
        <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: fixtureInsets.bottom }}>
          <VibesProvider identity={identity} api={api} purchases={purchases}>
            <Harness />
          </VibesProvider>
        </View>
      </ThemeContext.Provider>
    </SafeAreaInsetsContext.Provider>
  </SafeAreaFrameContext.Provider>
</SafeAreaProvider>);
