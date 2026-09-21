import { Grid, TAIL } from './grid';
import { applySgr, cellWidth, plain, type Style } from './sgr';

export interface Span { text: string; style: Style }
export type ScreenLine = Span[];
type Mode = 'text' | 'escape' | 'csi' | 'string' | 'skip';

/**
 * Plays terminal output onto a grid and reads back what it would show.
 *
 * A preview cannot just strip escape codes: Claude Code and Codex redraw in
 * place — cursor up, erase the line, write it again — so stripped output is
 * every frame they ever drew, one after another. Playing the bytes onto a grid
 * the computer's size leaves only the last one, the way the terminal shows it.
 * This covers what those tools and a shell use; anything else is skipped.
 */
export class TerminalScreen {
  private normal: Grid;
  private grid: Grid;
  private mode: Mode = 'text';
  private params = '';
  private style: Style = plain;
  private saved: { x: number; y: number; style: Style } | null = null;
  constructor(readonly cols = 80, readonly rows = 24) {
    this.normal = this.grid = new Grid(Math.max(2, cols), Math.max(1, rows));
  }
  write(data: string) {
    for (const ch of data) {
      const code = ch.codePointAt(0)!;
      if (this.mode === 'text') this.text(ch, code);
      else if (this.mode === 'escape') this.escape(ch);
      else if (this.mode === 'csi') {
        if (code >= 0x40 && code <= 0x7E) { this.mode = 'text'; this.csi(ch); }
        else if (code === 0x1B) this.mode = 'escape';
        else if (code >= 0x20) this.params += ch;
      }
      // OSC titles and links, DCS and the rest end at BEL or ST (ESC \).
      else if (this.mode === 'string') { if (code === 0x07) this.mode = 'text'; else if (code === 0x1B) this.mode = 'escape'; }
      else this.mode = 'text';
    }
  }
  /** Every row of the screen, each as runs of one style with trailing blanks dropped. */
  lines(): ScreenLine[] {
    return this.grid.lines.map(line => {
      const spans: Span[] = [];
      let end = line.length;
      while (end > 0 && (!line[end - 1] || !line[end - 1]!.ch.trim())) end--;
      for (let x = 0; x < end; x++) {
        const cell = line[x];
        if (cell === TAIL) continue;
        const style = cell?.style ?? plain;
        const last = spans[spans.length - 1];
        if (last && same(last.style, style)) last.text += cell?.ch ?? ' ';
        else spans.push({ text: cell?.ch ?? ' ', style });
      }
      return spans;
    });
  }
  private text(ch: string, code: number) {
    const grid = this.grid;
    if (code === 0x1B) this.mode = 'escape';
    else if (code === 0x0D) { grid.x = 0; grid.pending = false; }
    else if (code >= 0x0A && code <= 0x0C) { grid.pending = false; grid.feed(); }
    else if (code === 0x08) { grid.x = Math.max(0, grid.x - 1); grid.pending = false; }
    else if (code === 0x09) grid.moveTo((Math.floor(grid.x / 8) + 1) * 8, grid.y);
    else if (code >= 0x20 && code !== 0x7F && (code < 0x80 || code >= 0xA0)) grid.put(ch, cellWidth(code), this.style);
  }
  private escape(ch: string) {
    this.mode = 'text';
    const grid = this.grid;
    if (ch === '[') { this.mode = 'csi'; this.params = ''; }
    else if (']PX^_'.includes(ch)) this.mode = 'string';
    // Character sets and line attributes: one more byte, then back to text.
    else if ('()*+-./#% '.includes(ch)) this.mode = 'skip';
    else if (ch === '7') this.save();
    else if (ch === '8') this.restore();
    else if (ch === 'D') grid.feed();
    else if (ch === 'E') { grid.x = 0; grid.feed(); }
    else if (ch === 'M') grid.reverse();
    else if (ch === 'c') { this.normal = this.grid = new Grid(this.grid.cols, this.grid.rows); this.style = plain; }
  }
  private csi(final: string) {
    const raw = this.params;
    const lead = '?<=>'.includes(raw[0] ?? 'x') ? raw[0]! : '';
    const body = lead ? raw.slice(1) : raw;
    // Intermediate bytes mark sequences a preview has no use for, such as the cursor's shape.
    if (/[\x20-\x2F]/.test(body)) return;
    if (final === 'm') { if (!lead) this.style = applySgr(this.style, body); return; }
    const nums = body.split(';').map(part => parseInt(part, 10));
    if (lead === '?') { if (final === 'h' || final === 'l') for (const mode of nums) this.privateMode(mode, final === 'h'); return; }
    if (lead) return;
    const n = (index: number, fallback = 1) => (nums[index]! > 0 ? nums[index]! : fallback);
    const grid = this.grid;
    switch (final) {
      case 'A': grid.moveTo(grid.x, grid.y - n(0)); break;
      case 'B': case 'e': grid.moveTo(grid.x, grid.y + n(0)); break;
      case 'C': case 'a': grid.moveTo(grid.x + n(0), grid.y); break;
      case 'D': grid.moveTo(grid.x - n(0), grid.y); break;
      case 'E': grid.moveTo(0, grid.y + n(0)); break;
      case 'F': grid.moveTo(0, grid.y - n(0)); break;
      case 'G': case '`': grid.moveTo(n(0) - 1, grid.y); break;
      case 'd': grid.moveTo(grid.x, n(0) - 1); break;
      case 'H': case 'f': grid.moveTo(n(1) - 1, n(0) - 1); break;
      case 'J': grid.eraseDisplay(nums[0] || 0); break;
      case 'K': grid.eraseLine(nums[0] || 0); break;
      case '@': grid.insertChars(n(0)); break;
      case 'P': grid.deleteChars(n(0)); break;
      case 'X': grid.erase(grid.y, grid.x, grid.x + n(0)); break;
      case 'L': grid.insertLines(n(0)); break;
      case 'M': grid.deleteLines(n(0)); break;
      case 'S': grid.scroll(n(0)); break;
      case 'T': grid.scroll(-n(0)); break;
      case 'r': grid.region(n(0), n(1, grid.rows)); break;
      case 's': this.save(); break;
      case 'u': this.restore(); break;
    }
  }
  /** Only the alternate screen matters here: a full-screen program draws on its own page. */
  private privateMode(mode: number, on: boolean) {
    if (mode !== 1049 && mode !== 1047 && mode !== 47) return;
    if (on && this.grid === this.normal) {
      if (mode === 1049) this.save();
      this.grid = new Grid(this.normal.cols, this.normal.rows);
    } else if (!on && this.grid !== this.normal) {
      this.grid = this.normal;
      if (mode === 1049) this.restore();
    }
  }
  private save() { this.saved = { x: this.grid.x, y: this.grid.y, style: this.style }; }
  private restore() {
    if (!this.saved) return;
    this.grid.moveTo(this.saved.x, this.saved.y); this.style = this.saved.style;
  }
}
const same = (a: Style, b: Style) => a === b || (a.color === b.color && !a.bold === !b.bold && !a.dim === !b.dim);
