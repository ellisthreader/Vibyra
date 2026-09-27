import type { TextStyle } from 'react-native';

/**
 * The app's one type scale, in the system face (SF Pro on iPhone). Every screen
 * sizes its words from here, so a heading on the rail, a sheet and a page reads as
 * the same heading. Weights stay at 400/500/600/700; tracking tightens as size grows,
 * the way the system face is drawn.
 */
export const font = {
  /** First-run heroes and the one big line an empty page leads with. */
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.9 },
  /** A page's own title when it has one below the bar (Remote, a teammate). */
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  /** Empty states and section heroes. */
  title2: { fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4 },
  /** Bars, sheet titles, a card's name. */
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.35 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.2 },
  /** A list row's name. */
  row: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.2 },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: -0.1 },
  /** Help under a control, a row's second line. */
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.05 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  /** The quiet name above a group of rows, in sentence case. */
  section: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: -0.05 },
} satisfies Record<string, TextStyle>;

/** Corner radii: controls, cards, and the large surfaces that hold them. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 22 } as const;
/** The horizontal gutter every page, sheet and rail starts its content at. */
export const GUTTER = 20;
