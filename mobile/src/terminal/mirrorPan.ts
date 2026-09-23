/** Let a finger pan the desktop grid before xterm consumes it as scrollback. */
export function mirrorPan(view: HTMLElement, active: () => boolean) {
  let start: { x: number; y: number; left: number; top: number } | null = null;
  view.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      start =
        active() && event.touches.length === 1
          ? { x: touch.clientX, y: touch.clientY, left: view.scrollLeft, top: view.scrollTop }
          : null;
    },
    { passive: true, capture: true },
  );
  view.addEventListener(
    'touchmove',
    (event) => {
      if (!start || event.touches.length !== 1 || document.getSelection()?.toString()) {
        start = null;
        return;
      }
      const dx = start.x - event.touches[0].clientX,
        dy = start.y - event.touches[0].clientY;
      if (Math.hypot(dx, dy) < 10) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const top = Math.max(0, Math.min(view.scrollHeight - view.clientHeight, start.top + dy));
      // At the outer vertical edge xterm can consume the drag as scrollback.
      if (!horizontal && top === start.top) return;
      event.preventDefault();
      event.stopPropagation();
      if (horizontal) view.scrollLeft = start.left + dx;
      else view.scrollTop = top;
    },
    { passive: false, capture: true },
  );
  view.addEventListener(
    'touchend',
    () => {
      start = null;
    },
    { passive: true },
  );
  view.addEventListener(
    'touchcancel',
    () => {
      start = null;
    },
    { passive: true },
  );
}
