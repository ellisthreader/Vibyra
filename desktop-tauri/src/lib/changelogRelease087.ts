import type { ChangelogEntry } from './changelog';

export const RELEASE_087: ChangelogEntry = {
  version: '0.8.7', date: '2026-09-24', image: '/releases/0.8.7.svg',
  summary: 'Terminal launches recover after an interrupted reply.',
  sections: [
    { heading: 'Open terminals again', body: 'If a previous launch lost its reply, Vibyra now checks its saved receipt and opens your new terminal with the settings you chose. Any already created conversation remains available.' },
    { heading: 'Clearer launch failures', body: 'If the native session store cannot be checked, the app shows that error and preserves the request for a safe retry.' },
  ],
};
