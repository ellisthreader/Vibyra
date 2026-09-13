import { clampFontSize, MAX_FONT_SIZE, MIN_FONT_SIZE } from './fontFit';

// Pinching a terminal changes how many columns it has, never how much of a
// fixed grid you can see at once.
//
// The first attempt at this drew the computer's full ~158-column grid and let
// the phone pan around it. That is what iSH does, and it is the one thing every
// other iOS terminal deliberately avoids: reading then needs horizontal motion,
// which WCAG 1.4.10 exists to rule out and which no amount of render quality
// fixes. Blink, Termius and hterm all map the pinch onto the type size, let the
// grid fall out of it, and tell the far end the new size. This does the same.
export const MIN_STEP = 0.25;

/** Turns a Safari gesture scale into a type size, gently — a pinch is coarse. */
export const sizeForGesture = (base: number, scale: number) =>
  clampFontSize(base * (1 + (scale - 1) * 0.6));

export class PinchZoom {
  private base = 0;
  private lastTap = 0;

  /** `onSize` receives a new type size; the caller refits and reports columns. */
  constructor(
    private readonly element: HTMLElement,
    private readonly current: () => number,
    private readonly onSize: (size: number) => void,
  ) {
    element.addEventListener('gesturestart', event => {
      event.preventDefault();
      this.base = this.current();
    });
    element.addEventListener('gesturechange', event => {
      event.preventDefault();
      const { scale } = event as unknown as { scale: number };
      const next = sizeForGesture(this.base || this.current(), scale);
      if (Math.abs(next - this.current()) >= MIN_STEP) this.onSize(next);
    });
    element.addEventListener('gestureend', event => event.preventDefault());
    // Double tap cycles back to a readable size, so a pinch that went too far
    // is one gesture to undo rather than a careful pinch in the other direction.
    element.addEventListener('touchend', event => {
      if (event.touches.length > 0 || event.changedTouches.length !== 1) return;
      const now = Date.now();
      if (now - this.lastTap < 320) { this.lastTap = 0; this.reset(); }
      else this.lastTap = now;
    });
  }

  private reset() {
    const size = this.current();
    // Toward the middle of the range from wherever we are, so both a too-small
    // and a too-large grid come back with the same gesture.
    this.onSize(clampFontSize(size <= (MIN_FONT_SIZE + MAX_FONT_SIZE) / 2 ? size + 2 : size - 2));
  }
}
