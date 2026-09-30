import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { AuthScreen } from '../src/components/auth/AuthScreen';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { useAccountStore } from '../src/state/accountStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import type { AccountProfile } from '../src/types';

/**
 * Settings > Account on sample data: every membership an account can be on,
 * the second step on and off, devices, and the code step of a sign-in. No
 * request leaves this page — every command is answered here.
 */
const query = new URLSearchParams(location.search);
document.documentElement.dataset.platform = 'mac';
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
mockWindows('main');

const events: unknown[] = [];
const day = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
const plan = query.get('plan') ?? 'free';
const twoFactor = query.get('2fa') ?? 'off';
const deviceCount = Number(query.get('devices') ?? '3');

const memberships: Record<string, Partial<AccountProfile>> = {
  free: { plan: 'free' },
  stripe: {
    plan: 'builder', billingProvider: 'stripe', canManageStripeBilling: true,
    planRenewsAt: iso(21 * day), creditsResetAt: iso(21 * day),
  },
  annual: {
    plan: 'pro', billingProvider: 'stripe', canManageStripeBilling: true,
    planBillingCycle: 'annual', planRenewsAt: iso(200 * day), creditsResetAt: iso(21 * day),
  },
  cancelling: {
    plan: 'builder', billingProvider: 'stripe', canManageStripeBilling: true,
    membershipCancelAtPeriodEnd: true, membershipEndsAt: iso(12 * day), creditsResetAt: iso(12 * day),
  },
  appstore: {
    plan: 'pro', billingProvider: 'iap-apple', membershipEndsAt: iso(9 * day),
    planRenewsAt: iso(9 * day), creditsResetAt: iso(9 * day),
  },
};

const profile: AccountProfile = {
  name: 'Barbara Ellis', email: 'barbara@example.test', provider: query.get('provider') ?? 'email',
  plan: 'free', emailVerified: !query.has('unverified'), welcomeKey: 'vw_fixture',
  twoFactorEnabled: twoFactor === 'on', createdAt: '2026-03-02T09:00:00.000Z',
  planBillingCycle: 'monthly', planRenewsAt: null, creditsResetAt: iso(21 * day),
  membershipEndsAt: null, membershipCancelAtPeriodEnd: false, billingProvider: null,
  canManageStripeBilling: false, hasAvatar: query.has('photo'),
  ...memberships[plan],
};

// A 1×1 dot: enough to prove the photo path renders an image, not a letter.
const photo = 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
const devices = Array.from({ length: Math.max(0, deviceCount) }, (_, index) => [
  { id: 'a'.repeat(64), name: 'Ellis’s MacBook Pro · Vibyra Desktop (macOS)', location: 'London, United Kingdom', lastActive: iso(-60_000), current: true },
  { id: 'b'.repeat(64), name: 'iPhone 17 Pro', location: 'London, United Kingdom', lastActive: iso(-4 * 3600_000), current: false },
  { id: 'c'.repeat(64), name: 'Chrome · macOS', location: 'Manchester, United Kingdom', lastActive: iso(-6 * day), current: false },
][index]);

const RECOVERY = ['4f2a-91bd', '7c10-3ee4', 'a913-70fc', 'd42b-1c08', '5e77-be21', '90aa-4d13'];
const answers: Record<string, unknown> = {
  account_profile_refresh: () => useAccountStore.getState().snapshot,
  account_avatar: () => (query.has('photo') ? photo : null),
  account_credits: () => ({
    available: query.has('empty') ? 0 : 1_284, held: query.has('empty') ? 0 : 60,
    total: query.has('empty') ? 0 : 1_344, chatEnabled: !query.has('nochat'),
    purchasesEnabled: !query.has('nochat'),
  }),
  account_topup_options: () => [
    { key: 'topup_500', credits: 500, pricePence: 2000 },
    { key: 'topup_1500', credits: 1500, pricePence: 5800 },
    { key: 'topup_4000', credits: 4000, pricePence: 15200 },
  ],
  account_two_factor_status: () => ({
    enabled: twoFactor === 'on', available: twoFactor !== 'provider',
    confirmedAt: twoFactor === 'on' ? iso(-30 * day) : null,
    recoveryCodesLeft: twoFactor === 'on' ? 5 : 0,
  }),
  account_two_factor_start: () => ({
    secret: 'JBSWY3DPEHPK3PXP',
    uri: 'otpauth://totp/Vibyra:barbara@example.test?secret=JBSWY3DPEHPK3PXP&issuer=Vibyra',
    account: 'barbara@example.test',
  }),
  account_two_factor_confirm: () => RECOVERY,
  account_two_factor_recovery_codes: () => RECOVERY,
  account_devices: () => devices,
  account_device_revoke: () => ({ signedOut: false }),
  account_devices_revoke_all: () => ({ signedOut: true }),
};

const failing = (query.get('fail') ?? '').split(',').filter(Boolean);

mockIPC((command, payload) => {
  events.push([command, payload]);
  if (failing.some(name => command === `account_${name}`)) {
    throw 'Vibyra could not reach the account service. Check your connection and try again.';
  }
  const answer = answers[command];
  if (typeof answer === 'function') return (answer as () => unknown)();
  if (command === 'account_two_factor_submit') {
    const code = (payload as { code?: string }).code ?? '';
    if (code === '000000') {
      return { ...useAccountStore.getState().snapshot, error: 'That code didn’t match. Try the current code from your authenticator app.' };
    }
    return { status: 'signedIn', profile, error: null, pendingProvider: null, secureStorage: true };
  }
  if (command === 'account_two_factor_cancel') {
    return { status: 'signedOut', profile: null, error: null, pendingProvider: null, secureStorage: true };
  }
  return null;
});

Object.assign(window, { accountEvents: events, accountLast: () => events.at(-1) });

useAccountStore.setState({
  snapshot: {
    status: query.has('auth2fa') ? 'twoFactor' : 'signedIn',
    profile: query.has('auth2fa') ? null : profile,
    error: null, pendingProvider: null, secureStorage: !query.has('nokeyring'),
  },
  busy: false,
  // Ending the session reloads the real window; here it is only recorded.
  endSession: async () => { events.push(['end-session']); },
  logout: async () => { events.push(['logout']); },
  updateProfile: async (name, email) => { events.push(['update-profile', name, email]); return null; },
  forgotPassword: async (email) => { events.push(['forgot', email]); return 'Reset link sent.'; },
  resendVerification: async () => { events.push(['resend']); return 'Verification email sent.'; },
});
useSettingsStore.setState({ settings: { theme: 'dark', fontSize: 13, projects: [] } as never });
useTerminalStore.setState({ panes: (query.has('running')
  ? [{ id: 1, projectId: 'p', title: 'Running', agentId: 'codex', status: 'running', lastFocusedAt: Date.now(), accent: '#5b7cfa' }]
  : []) as never });
useWorkspaceStore.setState({ settingsOpen: true, settingsSection: 'account', settingsPanel: null });

createRoot(document.getElementById('root')!).render(
  query.has('auth2fa') ? <AuthScreen /> : <SettingsModal />,
);
