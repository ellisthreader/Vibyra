import type { ProjectKind } from '../../../lib/projectTemplateTypes';

/**
 * The nine kinds, drawn as one family rather than picked from a stock set.
 *
 * Stroke geometry on a 24x24 grid, rendered at 26px with a 1.5 stroke and round
 * joins, so every mark carries the same weight in the grid. They are drawn from
 * the thing's own structure — a browser frame, a phone, a server stack — and
 * held to the same density: an outline, one defining detail, and nothing else.
 * No globe for "website", no sparkles for "AI".
 *
 * Outlines only, and no fills: the mark is inked in the theme's own colour and
 * turns cobalt when its kind is chosen, so a filled shape would have to be
 * redrawn for selection.
 *
 * The phone keeps its own set in `mobile/src/ui/newProject/projectKindArt.ts`.
 * These are the desktop's; the two need not match stroke for stroke.
 */
export const KIND_ART: Record<ProjectKind, string[]> = {
  // A browser frame with a masthead and two lines of content under it.
  website: [
    'M4 4.75h16A1.75 1.75 0 0 1 21.75 6.5v11A1.75 1.75 0 0 1 20 19.25H4A1.75 1.75 0 0 1 2.25 17.5v-11A1.75 1.75 0 0 1 4 4.75Z',
    'M2.25 9.25h19.5',
    'M6 12.75h8M6 16h5',
  ],
  // The same frame with a sidebar: a window you navigate, not a page you read.
  webapp: [
    'M4 4.75h16A1.75 1.75 0 0 1 21.75 6.5v11A1.75 1.75 0 0 1 20 19.25H4A1.75 1.75 0 0 1 2.25 17.5v-11A1.75 1.75 0 0 1 4 4.75Z',
    'M2.25 9.25h19.5',
    'M9 9.25v10',
    'M12 13h6.5M12 16h4',
  ],
  // A phone, weighted to sit beside the monitor without dwarfing it.
  mobile: [
    'M8.75 2.75h6.5A1.75 1.75 0 0 1 17 4.5v15A1.75 1.75 0 0 1 15.25 21.25h-6.5A1.75 1.75 0 0 1 7 19.5v-15A1.75 1.75 0 0 1 8.75 2.75Z',
    'M10.5 18.25h3',
  ],
  // A monitor on its stand.
  desktop: [
    'M3.75 4.25h16.5A1.75 1.75 0 0 1 22 6v9.25A1.75 1.75 0 0 1 20.25 17H3.75A1.75 1.75 0 0 1 2 15.25V6a1.75 1.75 0 0 1 1.75-1.75Z',
    'M12 17v3.25M8.5 20.25h7',
  ],
  // A controller: the one metaphor for "game" nobody misreads.
  game: [
    'M8.25 8.25h7.5a5.75 5.75 0 0 1 5.75 5.75v0.75a2.75 2.75 0 0 1-4.93 1.67L15.5 14.75h-7l-1.07 1.67A2.75 2.75 0 0 1 2.5 14.75V14a5.75 5.75 0 0 1 5.75-5.75Z',
    'M6 11.5h2.5M7.25 10.25v2.5',
    'M16.25 11.25h.01M18.25 13h.01',
  ],
  // One thing calling the things that answer it: a stack, not a cloud.
  backend: [
    'M4 4.75h16A1.75 1.75 0 0 1 21.75 6.5v2.25A1.75 1.75 0 0 1 20 10.5H4A1.75 1.75 0 0 1 2.25 8.75V6.5A1.75 1.75 0 0 1 4 4.75Z',
    'M4 13.5h16a1.75 1.75 0 0 1 1.75 1.75v2.25A1.75 1.75 0 0 1 20 19.25H4A1.75 1.75 0 0 1 2.25 17.5v-2.25A1.75 1.75 0 0 1 4 13.5Z',
    'M5.75 7.6h.01M5.75 16.35h.01',
  ],
  // Brackets: the thing you publish and something else imports.
  library: [
    'M9 7.5 4.5 12 9 16.5',
    'M15 7.5 19.5 12 15 16.5',
    'M13 5.75 11 18.25',
  ],
  // A chip with a core, not another wand of sparkles.
  ai: [
    'M8.25 8.25h7.5A1.5 1.5 0 0 1 17.25 9.75v7.5a1.5 1.5 0 0 1-1.5 1.5h-7.5a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5Z',
    'M11 11.5h2.5v2.5H11Z',
    'M10 8.25V5.5M14.5 8.25V5.5M10 18.75v2.75M14.5 18.75v2.75',
    'M6.75 11.25H4M6.75 15.75H4M17.25 11.25H20M17.25 15.75H20',
  ],
  // A plain folder, quieter than the eight answers above it.
  empty: [
    'M3.25 8.5V6.5A1.75 1.75 0 0 1 5 4.75h3.9L11.4 8.5',
    'M3.25 8.5h15.75A1.75 1.75 0 0 1 20.75 10.25v7.25A1.75 1.75 0 0 1 19 19.25H5A1.75 1.75 0 0 1 3.25 17.5Z',
  ],
};
