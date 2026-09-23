import type { ProjectKind } from '../../scaffold/types';

/**
 * The nine kinds, drawn as one family rather than picked from a stock set.
 *
 * Each is stroke geometry on a 24x24 grid, rendered at 26px with a 1.75 stroke
 * and round joins, so every mark carries the same weight in the grid. They were
 * drawn to a brief — geometric, built from the thing's own structure, and no
 * globe for "website" or gamepad silhouette for "game" — then reviewed at size
 * and reworked where they failed: the first "game" read as a photo placeholder,
 * and the first "web app" was a near-twin of "website".
 *
 * Outlines only. A filled shape would break the family the moment a mark is
 * drawn in white on a filled tile, which is what selection does.
 */
export const KIND_ART: Record<ProjectKind, string[]> = {
  website: [
    'M5 3.5H19Q20.5 3.5 20.5 5V19Q20.5 20.5 19 20.5H5Q3.5 20.5 3.5 19V5Q3.5 3.5 5 3.5Z',
    'M3.5 7.5H20.5',
    'M7 11H17V14.5H7Z',
    'M7 17.5H10M13 17.5H17',
  ], // a page: masthead, and the columns under it
  webapp: [
    'M5 3H19Q21 3 21 5V19Q21 21 19 21H5Q3 21 3 19V5Q3 3 5 3Z M3 6.5H21',
    'M17 10.5a5 2 0 1 1-10 0 5 2 0 1 1 10 0Z',
    'M7 10.5V17Q7 19 12 19Q17 19 17 17V10.5',
    'M7 14Q7 16 12 16Q17 16 17 14',
  ], // a window with records kept inside it, which is what makes it an app
  mobile: [
    'M8 2.5H16Q18 2.5 18 4.5V19.5Q18 21.5 16 21.5H8Q6 21.5 6 19.5V4.5Q6 2.5 8 2.5Z',
    'M9 7.5H15 M9 11H13.5',
    'M10 18.5H14',
  ], // a phone with something on it, weighted like the monitor beside it
  desktop: [
    'M4 3.5H20Q21.5 3.5 21.5 5V15Q21.5 16.5 20 16.5H4Q2.5 16.5 2.5 15V5Q2.5 3.5 4 3.5Z',
    'M2.5 7.5H21.5M17.5 5.5H18.5',
    'M12 16.5V20.5M8 20.5H16',
  ], // a window on a stand
  game: [
    'M6 5.5H10V10H14V13.5H10V18H6V13.5H2V10H6Z',
    'M15.799999999999999 9.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0',
    'M17.900000000000002 15a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0',
  ], // a d-pad and two buttons, the one metaphor nobody misreads
  backend: [
    'M4 9H7Q8.5 9 8.5 10.5V13.5Q8.5 15 7 15H4Q2.5 15 2.5 13.5V10.5Q2.5 9 4 9Z',
    'M17 3.5H20Q21.5 3.5 21.5 5V8Q21.5 9.5 20 9.5H17Q15.5 9.5 15.5 8V5Q15.5 3.5 17 3.5Z',
    'M17 14.5H20Q21.5 14.5 21.5 16V19Q21.5 20.5 20 20.5H17Q15.5 20.5 15.5 19V16Q15.5 14.5 17 14.5Z',
    'M8.5 12H12M15.5 6.5H13.5Q12 6.5 12 8V16Q12 17.5 13.5 17.5H15.5',
  ], // one call branching to the things that answer it
  library: ['M4 7L12 3L20 7V17L12 21L4 17Z', 'M4 7L12 11L20 7M12 11V21', 'M8 5L16 9V13'], // a package — the thing you publish rather than run
  ai: [
    'M7.5 5.5H16.5Q18.5 5.5 18.5 7.5V16.5Q18.5 18.5 16.5 18.5H7.5Q5.5 18.5 5.5 16.5V7.5Q5.5 5.5 7.5 5.5Z',
    'M9 2.5V5.5M15 2.5V5.5M9 18.5V21.5M15 18.5V21.5',
    'M2.5 9H5.5M2.5 15H5.5M18.5 9H21.5M18.5 15H21.5',
    'M12 8.5L15.5 12L12 15.5L8.5 12Z',
  ], // a chip with a core, not another wand of sparkles
  empty: [
    'M3.5 8H20.5V18Q20.5 19.5 19 19.5H5Q3.5 19.5 3.5 18V8Z',
    'M3.5 8V6Q3.5 4.5 5 4.5H9L12.5 8',
  ], // a plain folder, quieter than the eight answers above it
};
