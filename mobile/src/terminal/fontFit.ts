// On a phone the type size *is* the column count, and the column count is what
// the program on the computer lays its output out for.
//
// This used to shrink the type until ~60 columns fitted, on the theory that
// more columns meant less wrapping. It is the wrong lever. The width is an
// input to the program: it asks the PTY how wide the terminal is and bakes
// that number into every byte it writes. When the phone renders narrower than
// the number the program was given, nothing wraps gracefully — a full-screen
// tool like Claude Code erases its previous frame by moving up one row per
// line it *thinks* it wrote, so if each of those lines is really taking three
// rows on the phone, two thirds of the old frame survives every repaint and
// the screen fills with stacked half-drawn copies.
//
// So the phone picks a size a person can actually read, works out how many
// columns that leaves, and tells the computer to use that many. Every shipped
// iOS terminal — Blink, Termius, hterm — works this way: pinching changes the
// grid, not the magnification.
export const MIN_FONT_SIZE = 11;
export const MAX_FONT_SIZE = 20;
/** Where a phone starts: comfortably readable, and what the Mac's own terminal uses. */
export const DEFAULT_FONT_SIZE = 13;
/** Below this a terminal stops being worth showing, whatever the type size. */
export const MIN_COLUMNS = 20;

export const clampFontSize = (size: number) => {
  // `Math.max(MIN, NaN)` is NaN, so a bad measurement would otherwise reach
  // xterm as a NaN font size and collapse the grid.
  if (!(size > 0)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size * 2) / 2));
};

/** How many columns `size` leaves in `width`. `advanceRatio` is cell width per px of type. */
export function columnsFor(width: number, size: number, advanceRatio: number) {
  if (!(width > 0) || !(size > 0) || !(advanceRatio > 0)) return MIN_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.floor(width / (size * advanceRatio)));
}

/** The largest size that still leaves `MIN_COLUMNS`, so a narrow phone stays usable. */
export function sizeForWidth(width: number, advanceRatio: number, preferred = DEFAULT_FONT_SIZE) {
  if (!(width > 0) || !(advanceRatio > 0)) return clampFontSize(preferred);
  const widest = width / (MIN_COLUMNS * advanceRatio);
  return clampFontSize(Math.min(preferred, widest));
}

let measured = 0;
function advanceRatio(family: string) {
  if (measured > 0) return measured;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;top:0;left:0';
  probe.style.font = `100px ${family}`;
  probe.textContent = 'M'.repeat(50);
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width / 50 / 100;
  probe.remove();
  if (width > 0) measured = width;
  return measured || 0.6;
}

export const fontSizeFor = (width: number, family: string, preferred = DEFAULT_FONT_SIZE) =>
  sizeForWidth(width, advanceRatio(family), preferred);
export const columnsAt = (width: number, size: number, family: string) =>
  columnsFor(width, size, advanceRatio(family));
