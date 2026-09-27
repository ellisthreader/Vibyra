import type { ChangelogEntry } from './changelog';

export const RELEASE_089: ChangelogEntry = {
  version: '0.8.9', date: '2026-09-25', image: '/releases/0.8.9.svg',
  summary: 'Linux terminals show each key as you type it.',
  sections: [
    { heading: 'Typing that keeps up', body: 'Fixed a Linux rendering delay that could leave terminal text one character behind, even though the shell had already received the key. Shell and AI terminals now use the renderer that paints each echo promptly.' },
    { heading: 'Shared Codex input', body: 'Keys typed into a shared Codex conversation keep their order while the terminal reconnects.' },
  ],
};
