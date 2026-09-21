import type { Terminal } from '@xterm/xterm';
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE } from './fontFit';
import type { Point, ZoomTarget } from './pinchZoom';
import { mirrorPan } from './mirrorPan';

// A Mac pane's own grid, drawn on a phone.
//
// The pane on the Mac is the one the person is working in, so the phone may
// not resize it: it draws exactly the Mac's columns and rows, at the default
// type size, on a stage inside a box that pans. It opens at readable type
// size; null fits the whole width, and double tap switches between them.
export interface Grid { cols: number; rows: number }
/** Small enough that a 200-column pane fits an iPhone; a double tap brings it back up. */
export const MIN_ZOOM = 3;
export const clampZoom = (size: number) => !(size > 0) ? DEFAULT_FONT_SIZE
  : Math.min(MAX_FONT_SIZE, Math.max(MIN_ZOOM, Math.round(size * 4) / 4));
/** A grid the computer sent, within what xterm will lay out, or null. */
export const parseGrid = (grid?: Partial<Grid> | null): Grid | null =>
  grid && Number.isInteger(grid.cols) && Number.isInteger(grid.rows) && grid.cols! > 0 && grid.rows! > 0
    ? { cols: Math.min(grid.cols!, 500), rows: Math.min(grid.rows!, 200) } : null;

export class MirrorStage {
  grid: Grid | null = null;
  zoom: number | null = DEFAULT_FONT_SIZE;
  /** A pinch over the Mac's grid is a zoom; a double tap swaps fitted and readable. */
  readonly zooming: ZoomTarget = {
    current: () => this.zoom ?? this.fitted(), clamp: clampZoom,
    apply: (size, at) => this.setZoom(size, at),
    reset: at => this.setZoom(this.zoom === null || Math.abs(this.zoom - this.fitted()) < 0.5 ? DEFAULT_FONT_SIZE : null, at),
  };

  /** `view` is the box that scrolls, `frame` what it scrolls over, `stage` where xterm draws. */
  constructor(private readonly terminal: Terminal, private readonly view: HTMLElement,
    private readonly frame: HTMLElement, private readonly stage: HTMLElement, private readonly onLayout: () => void) {
    mirrorPan(view, () => this.active);
  }

  get active() { return this.grid !== null; }

  /** The Mac's grid to draw, or null to give the terminal back to the phone's own width. */
  set(next: Grid | null) {
    if ((next === null) !== (this.grid === null)) {
      // Between a Mac's grid and this phone's own: the box scrolls only over a
      // mirrored grid, and the frame and stage fill it again once it is gone.
      this.view.classList.toggle('mirror', next !== null);
      for (const element of [this.frame, this.stage]) element.removeAttribute('style');
      this.zoom = DEFAULT_FONT_SIZE;
    }
    this.grid = next;
  }

  /** Draws the Mac's grid exactly, scaled to the zoom, inside the box that pans. */
  layout(follow: boolean) {
    const { grid, terminal } = this;
    if (!grid) return;
    if (terminal.options.fontSize !== DEFAULT_FONT_SIZE) terminal.options.fontSize = DEFAULT_FONT_SIZE;
    if (terminal.cols !== grid.cols || terminal.rows !== grid.rows) terminal.resize(grid.cols, grid.rows);
    const pixels = this.pixels();
    if (!pixels) return;
    const scale = this.scale();
    this.stage.style.width = `${pixels.width}px`;
    this.stage.style.height = `${pixels.height}px`;
    this.stage.style.transform = `scale(${scale})`;
    // The transform does not take part in layout, so the frame is sized by
    // hand to the scaled grid: that is what the box scrolls over.
    this.frame.style.width = `${Math.ceil(pixels.width * scale)}px`;
    this.frame.style.height = `${Math.ceil(pixels.height * scale)}px`;
    if (follow) { terminal.scrollToBottom(); this.revealCursor(false); }
    this.onLayout();
  }

  /** Changes the zoom, keeping the point under the fingers where it is. */
  setZoom(next: number | null, at: Point) {
    const { view } = this;
    const rect = view.getBoundingClientRect();
    const x = at.x - rect.left, y = at.y - rect.top;
    const before = this.scale();
    const px = (view.scrollLeft + x) / before, py = (view.scrollTop + y) / before;
    this.zoom = next;
    this.layout(false);
    const after = this.scale();
    view.scrollLeft = px * after - x;
    view.scrollTop = py * after - y;
  }

  /** Keep the real prompt in view when a native keyboard reduces the viewport. */
  cursorVisible() {
    const pixels = this.pixels();
    if (!this.grid || !pixels) return true;
    const buffer = this.terminal.buffer.active;
    const height = pixels.height / this.grid.rows * this.scale();
    const y = (buffer.baseY + buffer.cursorY - buffer.viewportY) * height;
    return y >= this.view.scrollTop - 1 && y + height <= this.view.scrollTop + this.view.clientHeight + 1;
  }

  revealCursor(horizontal = true) {
    const pixels = this.pixels();
    if (!this.grid || !pixels) return;
    const buffer = this.terminal.buffer.active;
    const cellWidth = pixels.width / this.grid.cols * this.scale();
    const cellHeight = pixels.height / this.grid.rows * this.scale();
    const x = Math.min(buffer.cursorX, this.grid.cols - 1) * cellWidth;
    const y = (buffer.baseY + buffer.cursorY - buffer.viewportY) * cellHeight;
    const { view } = this;
    if (horizontal && (x < view.scrollLeft || x + cellWidth > view.scrollLeft + view.clientWidth))
      view.scrollLeft = Math.max(0, x + cellWidth - view.clientWidth + 24);
    if (y < view.scrollTop || y + cellHeight > view.scrollTop + view.clientHeight)
      view.scrollTop = Math.max(0, y + cellHeight - view.clientHeight + 16);
  }

  /** The grid's size in unscaled pixels: what xterm built for its columns and rows. */
  private pixels() {
    const screen = this.stage.querySelector<HTMLElement>('.xterm-screen');
    return screen && screen.offsetWidth > 0 ? { width: screen.offsetWidth, height: screen.offsetHeight } : null;
  }
  /** The apparent type size at which the whole width fits the box. */
  private fitted() {
    const pixels = this.pixels();
    if (!pixels || this.view.clientWidth <= 0) return DEFAULT_FONT_SIZE;
    // Rounded down, so "fitted" never leaves a sliver to scroll to.
    return clampZoom(Math.floor(DEFAULT_FONT_SIZE * this.view.clientWidth / pixels.width * 4) / 4);
  }
  private scale() { return (this.zoom ?? this.fitted()) / DEFAULT_FONT_SIZE; }
}
