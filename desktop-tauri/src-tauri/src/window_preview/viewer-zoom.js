// Zoom for the shared window's picture: pinch or the Preview controls. The
// picture never leaves a gap it does not need, and while the keyboard is up the
// typing pan (viewer-pan.js) takes over until it closes. Taps still land
// exactly: the tap code measures the transformed picture.

const MAX = 5;

export function createZoom(screen) {
  let view = { x: 0, y: 0, scale: 1 }, typing = null;

  // The picture as drawn at scale 1: letterboxed inside the screen.
  function base() {
    const fit = Math.min(innerWidth / screen.naturalWidth, innerHeight / screen.naturalHeight) || 1;
    const width = screen.naturalWidth * fit, height = screen.naturalHeight * fit;
    return { left: (innerWidth - width) / 2, top: (innerHeight - height) / 2, width, height };
  }

  // Covers the screen where the picture is larger than it; centred where not.
  function clamp({ x, y, scale }) {
    const b = base(), s = Math.min(MAX, Math.max(1, scale));
    const axis = (offset, start, size, room) => size * s > room
      ? Math.min(-start * s, Math.max(room - (start + size) * s, offset))
      : (room - size * s) / 2 - start * s;
    return { x: axis(x, b.left, b.width, innerWidth), y: axis(y, b.top, b.height, innerHeight), scale: s };
  }

  function write() {
    const t = typing ?? view;
    screen.style.transform = t.scale === 1 && !t.x && !t.y ? '' : `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
  }

  /** Scales by `factor` keeping the screen point (cx, cy) still. */
  function around(start, factor, cx, cy, dx = 0, dy = 0) {
    const scale = Math.min(MAX, Math.max(1, start.scale * factor)), k = scale / start.scale;
    return clamp({ x: cx - (cx - start.x) * k + dx, y: cy - (cy - start.y) * k + dy, scale });
  }

  return {
    get view() { return view; },
    get zoomed() { return view.scale > 1.01; },
    /** Zoom in or out by `factor` around the middle of the screen. */
    by(factor) { view = around(view, factor, innerWidth / 2, innerHeight / 2); write(); },
    fit() { view = { x: 0, y: 0, scale: 1 }; write(); },
    /** A pinch: from `start` (the view when two fingers landed). It follows the
     * fingers exactly, with no easing, until `settle`. */
    pinch(start, factor, cx, cy, dx, dy) { screen.classList.add('live'); view = around(start, factor, cx, cy, dx, dy); write(); },
    settle() { screen.classList.remove('live'); },
    /** While typing, the pan decides; `null` hands the picture back. */
    type(next) { typing = next; write(); },
    refit() { view = clamp(view); write(); },
  };
}
