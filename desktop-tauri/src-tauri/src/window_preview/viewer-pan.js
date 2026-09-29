// While the phone keyboard is up it covers the lower part of the picture.
// Move the picture (and enlarge small text) so the text field being typed
// into sits just above the keyboard. The zoom module shows it, and gets the
// picture back as the person left it when typing ends.

export function createPan(screen, zoom) {
  let current = null;

  function set(next) {
    const same = current && Math.abs(next.x - current.x) < 3 && Math.abs(next.y - current.y) < 3 && Math.abs(next.scale - current.scale) < 0.02;
    if (same) return;
    current = next;
    zoom.type(next);
  }

  /** Keep `field` (window fractions) visible; `caret` refines where to look. */
  function keep(field, caret) {
    if (!field || !screen.naturalWidth || !screen.naturalHeight) return reset();
    const width = innerWidth, height = innerHeight, viewport = globalThis.visualViewport;
    const fit = Math.min(width / screen.naturalWidth, height / screen.naturalHeight);
    const drawnWidth = screen.naturalWidth * fit, drawnHeight = screen.naturalHeight * fit;
    const left = (width - drawnWidth) / 2, top = (height - drawnHeight) / 2;
    const box = { x: left + field[0] * drawnWidth, y: top + field[1] * drawnHeight, w: field[2] * drawnWidth, h: field[3] * drawnHeight };
    const visibleTop = (viewport?.offsetTop ?? 0) + 8;
    const visibleBottom = (viewport ? viewport.offsetTop + viewport.height : height) - 12;
    // Readable, not huge: text about 30px tall (or the person's own zoom), never
    // wider than the screen or taller than the room above the keyboard.
    let scale = Math.max(zoom.view.scale, box.h < 24 ? Math.min(2.5, 30 / Math.max(1, box.h)) : 1);
    scale = Math.max(1, Math.min(scale, (width - 16) / Math.max(1, box.w), (visibleBottom - visibleTop) / Math.max(1, box.h)));
    let x = 0;
    if (drawnWidth * scale > width) {
      // Centre the cursor (or the field) and keep the picture covering the screen.
      const lookAt = caret && caret[0] >= field[0] && caret[0] <= field[0] + field[2]
        ? left + caret[0] * drawnWidth : box.x + Math.min(box.w, width / scale) / 2;
      x = Math.min(-left * scale, Math.max(width - (left + drawnWidth) * scale, width / 2 - lookAt * scale));
    } else {
      x = (width - drawnWidth * scale) / 2 - left * scale;
    }
    let y = scale === 1 ? 0 : (visibleBottom + visibleTop) / 2 - (box.y + box.h / 2) * scale;
    if ((box.y + box.h) * scale + y > visibleBottom) y = visibleBottom - (box.y + box.h) * scale;
    if (box.y * scale + y < visibleTop) y = visibleTop - box.y * scale;
    set({ x, y, scale });
  }

  function reset() {
    if (!current) return;
    current = null;
    zoom.type(null);
  }

  return { keep, reset };
}
