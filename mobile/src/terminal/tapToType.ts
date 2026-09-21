// A tap on the output is how a phone asks to type: the runtime gives xterm's
// input the keyboard, or takes it away again. The tap is recognised here
// rather than left to the browser, because the mouse events a tap is
// otherwise turned into would focus xterm on every scroll and selection too.
//
// Only a tap counts. A drag scrolls, a long press selects text, two fingers
// pinch, and a tap while text is selected clears it; none of those types.
// A tap acts the moment the finger lifts. It used to wait out the double-tap
// window first, and a third of a second between the tap and the keyboard
// read as the terminal not answering; now the second tap of a double is the
// one that is dropped, since `PinchZoom` already spends it on the type size.
const SLOP = 10;
const HOLD = 350;
/** Matches `PinchZoom`'s double tap, which resets the type size instead. */
const DOUBLE = 320;
/**
 * A tap just after a drag is the finger catching the flick it left behind.
 * Only the finger's own drags count: the output scrolls itself on every frame
 * of a busy agent, and that must never swallow a tap.
 */
const SETTLE = 400;

export class TapToType {
  private start: { x: number; y: number; at: number } | null = null;
  private lastTap = 0;
  private draggedAt = 0;

  constructor(element: HTMLElement, onTap: () => void, onDoubleTap?: (at: { x: number; y: number }) => void) {
    element.addEventListener('touchstart', event => {
      const touch = event.touches[0];
      const quiet = Date.now() - this.draggedAt > SETTLE && !document.getSelection()?.toString();
      this.start = event.touches.length === 1 && quiet ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
    }, { passive: true, capture: true });
    element.addEventListener('touchmove', event => {
      const touch = event.touches[0];
      const origin = this.start;
      if (origin && event.touches.length === 1 && Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) <= SLOP) return;
      this.start = null;
      this.draggedAt = Date.now();
    }, { passive: true, capture: true });
    element.addEventListener('touchcancel', () => { this.start = null; });
    element.addEventListener('touchend', event => {
      const start = this.start;
      this.start = null;
      if (!start || event.touches.length > 0 || Date.now() - start.at > HOLD) return;
      const touch = event.changedTouches[0];
      if (touch && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > SLOP) return;
      // No synthetic mousedown, so only a recognised tap decides the keyboard.
      event.preventDefault();
      const now = Date.now();
      if (now - this.lastTap < DOUBLE) {
        this.lastTap = 0;
        if (touch) onDoubleTap?.({ x: touch.clientX, y: touch.clientY });
        return;
      }
      this.lastTap = now;
      onTap();
    }, { passive: false });
  }
}
