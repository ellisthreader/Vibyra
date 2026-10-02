import type { ChangelogEntry } from './changelogTypes.ts';

export const RELEASE_0819: ChangelogEntry = {
  version: '0.8.19', date: '2026-10-02', image: '/releases/0.8.19.png',
  summary: 'A personal welcome for the people helping shape Vibyra.',
  sections: [
    { heading: 'Welcome, beta testers', body: 'Your confirmed beta license opens a personal welcome after setup, with your Pro duration and expiry. Dismiss it once and carry on in your workspace.' },
    { heading: 'Claim your invitation', body: 'Add an optional license key when creating your account, or redeem it later in Account settings. Pro and its token allowance activate after verification.' },
    { heading: 'Help make Vibyra better', body: 'Report a problem directly from your welcome or from the sidebar. You choose what to include before sending.' },
  ],
};
