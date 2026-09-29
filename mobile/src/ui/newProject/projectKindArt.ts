import type { ProjectKind } from '../../scaffold/types';

/**
 * The nine kinds, drawn as one family: outline marks in the SF Symbols and
 * Lucide manner, generated with the Codex CLI to a brief and checked at size
 * on the card. Each is stroke geometry on a 24x24 grid with a 1.75 stroke and
 * round joins, two to four strokes, so the set reads as simple and even at 20px.
 *
 * Outlines only. A filled shape would break the family the moment a mark is
 * drawn in white on a filled tile.
 */
export const KIND_ART: Record<ProjectKind, string[]> = {
  website: [
    'M5 3.5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2ZM3 8h18',
    'M16.5 14.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 1 1 9 0Z',
    'M12 10c-2 2.5-2 6.5 0 9 2-2.5 2-6.5 0-9Z',
    'M7.5 14.5h9',
  ], // a browser with the web in it
  webapp: [
    'M5 3.5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2ZM3 8h18',
    'M6 11h4v6.5H6Z',
    'M13 11h5v2.5h-5ZM13 17.5h5',
  ], // a browser with a dashboard in it
  mobile: [
    'M7.5 2.5h9a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2Z',
    'M10 5.5h4M10.5 18.5h3',
  ], // a phone
  desktop: [
    'M4.5 3.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z',
    'M12 16.5v4M8 20.5h8',
  ], // a monitor on a stand
  game: [
    'M8 6.5h8c2 0 3 1.5 3.5 3.5l2 7c.5 2-1.5 3-3 1.5L15 15H9l-3.5 3.5C4 20 2 19 2.5 17l2-7C5 8 6 6.5 8 6.5Z',
    'M6 11h4M8 9v4',
    'M15.5 10a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0Z',
    'M18.5 12.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0Z',
  ], // a controller
  backend: [
    'M5 3.5h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z',
    'M5 13.5h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z',
    'M7.5 7a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0ZM7.5 17a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0Z',
    'M12 7h5M12 17h5',
  ], // a server stack
  library: ['M12 2.5 21 7.5v9l-9 5-9-5v-9Z', 'M3 7.5 12 12.5 21 7.5M12 12.5v9', 'M7.5 5 16.5 10'], // a package — the thing you publish rather than run
  ai: [
    'M10 4.5 12.5 10.5 18 13 12.5 15.5 10 21 7.5 15.5 2 13 7.5 10.5Z',
    'M18.5 2.5 19.5 5 22 6 19.5 7 18.5 9.5 17.5 7 15 6 17.5 5Z',
  ], // sparkles
  empty: [
    'M2.5 8.5V6a2 2 0 0 1 2-2H9l2 2.5h8.5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-10Z',
    'M2.5 8.5h19',
  ], // a plain folder, quieter than the eight answers
};
