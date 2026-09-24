import type { ChangelogEntry } from './changelog';

export const RELEASE_088: ChangelogEntry = {
  version: '0.8.8', date: '2026-09-24', image: '/releases/0.8.8.svg',
  summary: 'Codex terminals stay connected when you open or reconnect them.',
  sections: [
    { heading: 'Connected Codex terminals', body: 'Fixed the local connection that could close while Codex resumed a conversation, leaving the terminal on a broken pipe. Opening and reconnecting a terminal now completes the connection before switching to live output.' },
  ],
};
