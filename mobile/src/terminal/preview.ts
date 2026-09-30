import { TerminalScreen, type ScreenLine } from './screen';

/** How much of a terminal's tail is replayed for its preview: several screens' worth. */
const REPLAY = 32000;
const blank = (line: ScreenLine) => !line.some((span) => span.text.trim());

/**
 * The last few lines a terminal is showing, for a thumbnail of it.
 *
 * Only the tail is replayed, starting at a line break so it never begins
 * inside an escape sequence. The screen's unused bottom is dropped and runs of
 * empty rows close up to one, so a small preview spends its lines on text.
 */
export function previewLines(output: string, cols = 80, rows = 24, count = 5): ScreenLine[] {
  let text = output;
  if (text.length > REPLAY) {
    const cut = text.length - REPLAY;
    const newline = text.indexOf('\n', cut);
    text = text.slice(newline >= 0 ? newline + 1 : cut);
  }
  const screen = new TerminalScreen(cols, rows);
  screen.write(text);
  const kept: ScreenLine[] = [];
  for (const line of screen.lines()) {
    if (blank(line) && (kept.length === 0 || blank(kept[kept.length - 1]!))) continue;
    kept.push(line);
  }
  while (kept.length && blank(kept[kept.length - 1]!)) kept.pop();
  const shown = kept.slice(-count);
  // Blank runs are already one row, so at most one can open the window.
  return shown.length && blank(shown[0]!) ? shown.slice(1) : shown;
}
