// A pinch on the terminal. What it changes depends on whose grid this is:
//
// A Host's terminal exists for this phone, so pinching changes how many
// columns it has, never how much of a fixed grid you can see at once. Blink,
// Termius and hterm all map the pinch onto the type size, let the grid fall
// out of it, and tell the far end the new size (`fontFit.ts`).
//
// A Mac pane is the one the person is working in, so the phone may not
// resize it. There the pinch is a zoom over the Mac's own grid, and reading
// may take a pan — the one thing the first kind avoids, accepted here
// because the alternative was shrinking the display on the Mac.
export const MIN_STEP = 0.25;

/** Turns a Safari gesture scale into a type size, gently — a pinch is coarse. */
export const sizeForGesture = (base: number, scale: number, clamp: (size: number) => number) =>
  clamp(base * (1 + (scale - 1) * 0.6));

export interface Point {
  x: number;
  y: number;
}
/** What a pinch acts on: a size to read and change, and a double tap's reset. */
export interface ZoomTarget {
  current(): number;
  clamp(size: number): number;
  /** `at` is where the fingers are, for keeping that point still under them. */
  apply(size: number, at: Point): void;
  /** A double tap at `at`: back to a readable size, whatever that means here. */
  reset(at: Point): void;
}

export class PinchZoom {
  private base = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly target: () => ZoomTarget,
  ) {
    element.addEventListener('gesturestart', (event) => {
      event.preventDefault();
      this.base = this.target().current();
    });
    element.addEventListener('gesturechange', (event) => {
      event.preventDefault();
      const { scale, clientX, clientY } = event as unknown as {
        scale: number;
        clientX?: number;
        clientY?: number;
      };
      const target = this.target();
      const next = sizeForGesture(this.base || target.current(), scale, (size) =>
        target.clamp(size),
      );
      if (Math.abs(next - target.current()) >= MIN_STEP)
        target.apply(next, this.point(clientX, clientY));
    });
    element.addEventListener('gestureend', (event) => event.preventDefault());
  }

  /** Where the gesture is, or the middle of the terminal when Safari does not say. */
  private point(x?: number, y?: number): Point {
    if (typeof x === 'number' && typeof y === 'number') return { x, y };
    const rect = this.element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
}
