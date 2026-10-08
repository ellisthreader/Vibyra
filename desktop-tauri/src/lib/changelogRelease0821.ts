import type { ChangelogEntry } from './changelogTypes.ts';

export const RELEASE_0821: ChangelogEntry = {
  version: '0.8.21', date: '2026-10-02', image: '/releases/0.8.21.svg',
  summary: 'A responsive workspace and clearer voice conversations.',
  sections: [
    { heading: 'Speak when it is ready', body: 'Voice shows Opening microphone until capture is ready, then Listening. Canceling startup keeps your next conversation intact.' },
    { heading: 'A responsive workspace', body: 'Includes the fix for native window freezes during background updates, while preserving your accounts, projects and saved conversations.' },
  ],
};
