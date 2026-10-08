import type { ChangelogEntry } from './changelogTypes.ts';

export const RELEASE_0820: ChangelogEntry = {
  version: '0.8.20', date: '2026-10-02', image: '/releases/0.8.20.svg',
  summary: 'Keep your workspace responsive while background updates arrive.',
  sections: [
    { heading: 'A responsive workspace', body: 'Fixes a native window freeze that could happen when a background update arrived during another app action.' },
    { heading: 'Your existing setup', body: 'Keeps your beta welcome, account, saved projects and conversations, with the same privacy and permission protections.' },
  ],
};
