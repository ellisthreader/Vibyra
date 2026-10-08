import {
  PANE_BORDER_PX,
  PANE_CHROME,
  SCROLLBAR_PX,
  densityFor,
  type PaneChrome,
  type PaneDensity,
} from "./paneChrome.ts";

/**
 * Picks the pane grid for the terminal stage.
 *
 * The old rule was a ladder — up to 4 panes two columns, up to 9 three, then
 * four — capped only by a 360px minimum pane width. It never looked at stage
 * height, so the seventh pane silently added a third row and every terminal
 * lost a third of its lines. That is where the grid stopped being readable.
 *
 * So rather than a ladder, this searches every column count against every font
 * the panes could render at, and keeps whichever puts the most terminal text
 * on screen. Four things shape the score:
 *
 *  - width past `USEFUL_COLS` counts for nothing, because an agent CLI wraps
 *    its output long before that, so spare width buys more panes, not wider
 *    ones;
 *  - empty cells in the last row are wasted stage, so the score is weighted by
 *    how much of the grid is filled;
 *  - panes pushed below the fold by a scrolling stage are weighted out the
 *    same way, so a layout only scrolls when nothing else fits;
 *  - smaller text is discounted faster than it shrinks, so a font trade has to
 *    win back more lines than it costs in legibility.
 *
 * Panes also hand back their chrome as they get shorter (`paneChrome.ts`) and
 * stop shrinking at `minPaneHeight`, below which the stage scrolls instead of
 * squeezing terminals into slivers.
 */

/** Beyond this, extra width is margin an agent CLI never draws into. */
const USEFUL_COLS = 64;
/** Beyond this, extra lines are scrollback you would have scrolled to anyway. */
const USEFUL_ROWS = 20;
/**
 * Below this a pane stops being a view you can follow and becomes a slit you
 * have to scroll — the state that made seven terminals unreadable. Panes under
 * it are discounted by how far under, so the search takes a smaller font or a
 * tighter frame over one more short row every time.
 */
const COMFORT_ROWS = 14;
/** Narrower than this and output wraps so hard the extra pane is a loss. */
const MIN_TEXT_COLS = 44;
/** Fewer lines than this is scrollback, not a view; the stage scrolls first. */
const MIN_TEXT_ROWS = 10;
/** Floor on the traded-down font. Below this the text stops being scannable. */
const MIN_FONT_PX = 10;
/** Legibility falls off faster than point size, so discount it faster too. */
const FONT_WEIGHT = 1.5;
/** Width held back for the stage scrollbar once the grid outgrows the view. */
const STAGE_SCROLLBAR_PX = 15;
/** Scores within this of the best are a coin flip, settled on legibility. */
const TIE_BAND = 0.95;

export interface StageMetrics {
  width: number;
  height: number;
  /** Cell size at `fontSize`, measured off a live pane where possible. */
  cellWidth: number;
  cellHeight: number;
  /** The user's configured terminal font size. */
  fontSize: number;
}

export interface GridLayout {
  columns: number;
  rows: number;
  density: PaneDensity;
  chrome: PaneChrome;
  /** Font every pane renders at; never above the configured size. */
  fontSize: number;
  /** Row height the grid refuses to go below, at which point it scrolls. */
  minPaneHeight: number;
  paneWidth: number;
  paneHeight: number;
  /** True once the rows no longer fit the stage and it has to scroll. */
  scrolls: boolean;
}

interface Candidate extends GridLayout {
  score: number;
  textRows: number;
}

/** Shortest a pane may get: `MIN_TEXT_ROWS` lines at the smallest font. */
function floorHeight(metrics: StageMetrics): number {
  const cell = (metrics.cellHeight * MIN_FONT_PX) / Math.max(1, metrics.fontSize);
  const { header, insetY } = PANE_CHROME.dense;
  return Math.ceil(MIN_TEXT_ROWS * cell) + header + insetY + PANE_BORDER_PX;
}

function evaluate(
  panes: number,
  columns: number,
  fontSize: number,
  metrics: StageMetrics,
): Candidate | null {
  const rows = Math.ceil(panes / columns);
  const roomy = PANE_CHROME.comfortable;
  const probe = (metrics.height - roomy.padding * 2 - roomy.gap * (rows - 1)) / rows;
  const density = densityFor(probe);
  const chrome = PANE_CHROME[density];

  const minPaneHeight = floorHeight(metrics);
  const natural = (metrics.height - chrome.padding * 2 - chrome.gap * (rows - 1)) / rows;
  const scrolls = natural < minPaneHeight;
  const paneHeight = Math.max(natural, minPaneHeight);
  // A scrolling stage keeps its own gutter, which is width the panes never get.
  const usable = metrics.width - (scrolls ? STAGE_SCROLLBAR_PX : 0);
  const paneWidth = (usable - chrome.padding * 2 - chrome.gap * (columns - 1)) / columns;

  const hostWidth = paneWidth - PANE_BORDER_PX - chrome.insetX - SCROLLBAR_PX;
  const hostHeight = paneHeight - PANE_BORDER_PX - chrome.header - chrome.insetY;
  if (hostWidth <= 0 || hostHeight <= 0) return null;

  const scale = fontSize / metrics.fontSize;
  const textCols = Math.floor(hostWidth / (metrics.cellWidth * scale));
  const textRows = Math.floor(hostHeight / (metrics.cellHeight * scale));
  if (textCols < MIN_TEXT_COLS || textRows < MIN_TEXT_ROWS) return null;

  // Panes the stage cannot show at once are worth no more than the ones it can.
  const perScreen = Math.floor(
    (metrics.height - chrome.padding * 2 + chrome.gap) / (paneHeight + chrome.gap),
  );
  const onStage = Math.min(panes, columns * Math.max(1, perScreen));
  const weight =
    (onStage / panes) *
    (panes / (columns * rows)) *
    Math.min(1, textRows / COMFORT_ROWS) *
    scale ** FONT_WEIGHT;
  return {
    columns,
    rows,
    density,
    chrome,
    fontSize,
    minPaneHeight,
    paneWidth,
    paneHeight,
    scrolls,
    score: Math.min(textCols, USEFUL_COLS) * Math.min(textRows, USEFUL_ROWS) * weight,
    textRows,
  };
}

/**
 * Two layouts within `TIE_BAND` are the same trade in different clothes. There
 * a stage that shows every pane wins, then the larger font — a font is only
 * worth shrinking when it buys a clear gain — and finally lines of history.
 */
function better(candidate: Candidate, best: Candidate): boolean {
  const tied = candidate.score >= best.score * TIE_BAND && best.score >= candidate.score * TIE_BAND;
  if (!tied) return candidate.score > best.score;
  if (candidate.scrolls !== best.scrolls) return !candidate.scrolls;
  if (candidate.fontSize !== best.fontSize) return candidate.fontSize > best.fontSize;
  return candidate.textRows > best.textRows;
}

export function terminalGridLayout(paneCount: number, metrics: StageMetrics): GridLayout {
  const panes = Math.max(1, paneCount);
  const smallest = Math.min(MIN_FONT_PX, metrics.fontSize);
  let best: Candidate | null = null;
  for (let columns = 1; columns <= panes; columns += 1) {
    for (let font = metrics.fontSize; font >= smallest; font -= 1) {
      const candidate = evaluate(panes, columns, font, metrics);
      if (candidate && (!best || better(candidate, best))) best = candidate;
    }
  }
  return best ?? forced(panes, metrics);
}

/** Last resort for a stage too small for any readable pane: one column. */
function forced(panes: number, metrics: StageMetrics): GridLayout {
  const chrome = PANE_CHROME.dense;
  const minPaneHeight = floorHeight(metrics);
  return {
    columns: 1,
    rows: panes,
    density: "dense",
    chrome,
    fontSize: Math.min(MIN_FONT_PX, metrics.fontSize),
    minPaneHeight,
    paneWidth: Math.max(0, metrics.width - chrome.padding * 2),
    paneHeight: minPaneHeight,
    scrolls: true,
  };
}
