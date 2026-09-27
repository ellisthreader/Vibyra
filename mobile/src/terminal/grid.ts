import type { Style } from './sgr';

export interface Cell {
  ch: string;
  style: Style;
}
/** The right half of a wide character, which the cell before it already draws. */
export const TAIL: Cell = { ch: '', style: {} };
type Line = (Cell | undefined)[];

// One screen of cells at the size the computer draws at, with the cursor and
// scroll region a program moves around it. Only what a preview reads is kept:
// no scrollback, no backgrounds, no tab stops beyond every eighth column.
export class Grid {
  lines: Line[];
  x = 0;
  y = 0;
  top = 0;
  bottom: number;
  /** The last column was just written, so the next character starts a new line. */
  pending = false;
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.lines = Array.from({ length: rows }, () => []);
    this.bottom = rows - 1;
  }
  put(ch: string, width: number, style: Style) {
    if (width === 0) {
      this.join(ch);
      return;
    }
    if (this.pending || (width === 2 && this.x === this.cols - 1)) {
      this.x = 0;
      this.pending = false;
      this.feed();
    }
    const line = this.lines[this.y]!;
    line[this.x] = { ch, style };
    if (width === 2) line[this.x + 1] = TAIL;
    if (this.x + width >= this.cols) {
      this.x = this.cols - 1;
      this.pending = true;
    } else this.x += width;
  }
  /** A combining mark or joiner belongs to the character already drawn. */
  private join(ch: string) {
    const line = this.lines[this.y]!;
    let at = this.pending ? this.x : this.x - 1;
    if (line[at] === TAIL) at--;
    const cell = line[at];
    if (cell && cell !== TAIL) line[at] = { ch: cell.ch + ch, style: cell.style };
  }
  moveTo(x: number, y: number) {
    this.x = Math.max(0, Math.min(this.cols - 1, x));
    this.y = Math.max(0, Math.min(this.rows - 1, y));
    this.pending = false;
  }
  feed() {
    if (this.y === this.bottom) this.scroll(1);
    else if (this.y < this.rows - 1) this.y++;
  }
  reverse() {
    if (this.y === this.top) this.scroll(-1);
    else if (this.y > 0) this.y--;
  }
  /** Moves the lines from `from` to the region's bottom up by n, or down for negative n. */
  scroll(n: number, from = this.top) {
    if (from < this.top || from > this.bottom) return;
    const count = Math.min(Math.abs(n), this.bottom - from + 1);
    for (let i = 0; i < count; i++) {
      if (n > 0) {
        this.lines.splice(from, 1);
        this.lines.splice(this.bottom, 0, []);
      } else {
        this.lines.splice(this.bottom, 1);
        this.lines.splice(from, 0, []);
      }
    }
  }
  region(top: number, bottom: number) {
    if (top >= bottom || bottom > this.rows) return;
    this.top = top - 1;
    this.bottom = bottom - 1;
    this.moveTo(0, 0);
  }
  /** Blanks columns [from, to) of line y. */
  erase(y: number, from: number, to: number) {
    const line = this.lines[y];
    if (!line) return;
    for (let i = Math.max(0, from); i < Math.min(to, line.length); i++) line[i] = undefined;
  }
  eraseLine(mode: number) {
    if (mode === 0) this.erase(this.y, this.x, this.cols);
    else if (mode === 1) this.erase(this.y, 0, this.x + 1);
    else this.lines[this.y] = [];
    this.pending = false;
  }
  eraseDisplay(mode: number) {
    if (mode === 0) {
      this.eraseLine(0);
      for (let y = this.y + 1; y < this.rows; y++) this.lines[y] = [];
    } else if (mode === 1) {
      this.eraseLine(1);
      for (let y = 0; y < this.y; y++) this.lines[y] = [];
    } else this.lines = Array.from({ length: this.rows }, () => []);
  }
  insertChars(n: number) {
    const line = this.lines[this.y]!;
    if (line.length > this.x) line.splice(this.x, 0, ...new Array<undefined>(n));
    line.length = Math.min(line.length, this.cols);
  }
  deleteChars(n: number) {
    this.lines[this.y]!.splice(this.x, n);
  }
  insertLines(n: number) {
    this.scroll(-n, this.y);
    this.x = 0;
  }
  deleteLines(n: number) {
    this.scroll(n, this.y);
    this.x = 0;
  }
}
