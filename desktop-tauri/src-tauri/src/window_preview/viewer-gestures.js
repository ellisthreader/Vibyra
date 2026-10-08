// Fingers on the picture. iOS sends no click for a tap on a plain image, so
// taps are read from pointer events: press and release in place clicks, a long
// press right-clicks, one moving finger scrolls the window, and two fingers
// pinch and move the picture (zoom stays on the phone; the window never sees it).

const LONG_PRESS_MS = 550, SLOP_PX = 12;

export function watchGestures(screen, { tap, scroll, zoom }) {
  const fingers = new Map();
  let press = null, pinch = null;
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const drop = () => { if (press) clearTimeout(press.timer); press = null; };

  screen.addEventListener('pointerdown', event => {
    event.preventDefault();
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size === 2) { // A second finger makes a pinch, never a tap or a scroll.
      drop();
      const at = spread();
      pinch = { start: zoom.view, d: at.d, x: at.x, y: at.y };
      return;
    }
    if (fingers.size > 2 || pinch) return;
    const at = { x: event.clientX, y: event.clientY };
    press = { ...at, lastY: at.y, moved: 0, scrolling: false, flushed: 0,
      timer: setTimeout(() => { if (press && !press.scrolling) { press = null; tap(at.x, at.y, true); } }, LONG_PRESS_MS) };
  });

  function flush(final) {
    if (!press?.scrolling || !press.moved || (!final && Date.now() - press.flushed < 60)) return;
    scroll(press.x, press.y, press.moved);
    press.moved = 0; press.flushed = Date.now();
  }

  screen.addEventListener('pointermove', event => {
    if (!fingers.has(event.pointerId)) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && fingers.size >= 2) {
      const at = spread();
      zoom.pinch(pinch.start, at.d / pinch.d, pinch.x, pinch.y, at.x - pinch.x, at.y - pinch.y);
      return;
    }
    if (!press) return;
    if (!press.scrolling && Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) { clearTimeout(press.timer); press.scrolling = true; }
    if (press.scrolling) { press.moved += event.clientY - press.lastY; press.lastY = event.clientY; flush(false); }
  });

  function lift(event) {
    fingers.delete(event.pointerId);
    if (pinch) { if (!fingers.size) { pinch = null; zoom.settle(); } return; } // The rest of a pinch does nothing.
    if (!press) return;
    if (event.type === 'pointercancel') return drop();
    event.preventDefault(); clearTimeout(press.timer);
    if (press.scrolling) { flush(true); press = null; return; }
    const { x, y } = press; press = null;
    tap(x, y, false);
  }
  screen.addEventListener('pointerup', lift);
  screen.addEventListener('pointercancel', lift);
  screen.addEventListener('contextmenu', event => event.preventDefault());
}
