// The Preview controls, as on a website's Live preview: one round settings
// button the person can drag anywhere, and a sheet with everything else. They
// live in the viewer so "Show keyboard" is a tap inside the page (iOS raises
// the keyboard only then) and they work with every version of the phone app.
// Close and Choose window need the app to say it can do them (`vibyraShell`).

const SIZE = 48;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export function createControls({ keyboard, zoom, canControl, notify }) {
  const button = document.querySelector('#controls'), sheet = document.querySelector('#sheet');
  const shell = globalThis.vibyraShell ?? {};
  let spot = null, drag = null, wasTyping = false, hiding = 0;
  if (shell.accent) button.style.background = shell.accent;
  // A phone that may only look gets zoom and the window list, not the keys.
  sheet.querySelectorAll('[data-typing]').forEach(part => { part.hidden = !canControl; });
  button.hidden = false;
  sheet.querySelector('#closePreview').hidden = !shell.close;
  sheet.querySelector('[data-action="targets"]').hidden = !shell.targets;
  sheet.querySelector('#targetsRule').hidden = !shell.targets;
  if (shell.label) sheet.querySelector('#sheetLocation').textContent = `${shell.label} · Running on your ${document.body.dataset.host || 'computer'}`;

  // Where the button may sit: on screen and above the keyboard.
  function bounds() {
    const viewport = globalThis.visualViewport, bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
    return { right: innerWidth - SIZE - 10, top: 10 + (viewport?.offsetTop ?? 0), bottom: bottom - SIZE - 10 };
  }
  function place(next = spot) {
    const b = bounds();
    spot = next ?? { x: innerWidth - SIZE - 16, y: Math.round(innerHeight * 0.42) };
    button.style.transform = `translate(${clamp(spot.x, 10, b.right)}px, ${clamp(spot.y, b.top, Math.max(b.top, b.bottom))}px)`;
  }
  addEventListener('resize', () => place(null)); // Turned sideways: back to the edge, as on websites.
  globalThis.visualViewport?.addEventListener('resize', () => place());
  place();

  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, from: { ...spot }, moved: false };
  });
  button.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) place({ x: drag.from.x + dx, y: drag.from.y + dy });
  });
  button.addEventListener('pointerup', event => {
    event.preventDefault();
    const tapped = drag && !drag.moved;
    if (drag?.moved) { const b = bounds(); spot = { x: clamp(spot.x, 10, b.right), y: clamp(spot.y, b.top, b.bottom) }; }
    drag = null;
    if (tapped) open();
  });
  button.addEventListener('pointercancel', () => { drag = null; });

  function open() {
    clearTimeout(hiding);
    wasTyping = keyboard.open;
    keyboard.close(); // The sheet needs the room; closing it brings typing back.
    keyboard.hold(true);
    refresh();
    sheet.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
  }
  function hide(resumeTyping) {
    sheet.classList.remove('open');
    hiding = setTimeout(() => { sheet.hidden = true; }, 220);
    keyboard.hold(false);
    if (resumeTyping && wasTyping) keyboard.resume();
    wasTyping = false;
  }
  function refresh() {
    const percent = Math.round(zoom.view.scale * 100);
    sheet.querySelector('#zoomValue').textContent = `${percent}%`;
    sheet.querySelector('[data-action="fit"]').disabled = !zoom.zoomed;
    sheet.querySelector('[data-action="zoomOut"]').disabled = !zoom.zoomed;
    sheet.querySelector('[data-action="zoomIn"]').disabled = zoom.view.scale >= 4.99;
  }

  const actions = {
    done: () => hide(true),
    keyboard: () => { hide(false); keyboard.openManual(); },
    zoomIn: () => { zoom.by(1.25); refresh(); },
    zoomOut: () => { zoom.by(0.8); refresh(); },
    fit: () => { zoom.fit(); refresh(); },
    refresh: () => location.reload(),
    targets: () => { hide(false); notify('targets'); },
    close: () => { hide(false); notify('close'); },
  };
  // Buttons act on release and never take focus, as the website controls do.
  // iOS follows a tap on a button with a click that moves focus away from a field
  // just focused (the keyboard then never rises), so that follow-up is cancelled.
  sheet.addEventListener('pointerdown', event => { if (event.target.closest('button')) event.preventDefault(); });
  sheet.addEventListener('touchend', event => { if (event.target.closest('button, #sheetBackdrop')) event.preventDefault(); }, { passive: false });
  button.addEventListener('touchend', event => event.preventDefault(), { passive: false });
  sheet.addEventListener('pointerup', event => {
    const target = event.target.closest('button, #sheetBackdrop');
    if (!target || target.disabled) return;
    event.preventDefault();
    if (target.id === 'sheetBackdrop') return hide(true);
    if (target.dataset.key) {
      keyboard.press(target.dataset.key);
      target.classList.add('sent'); setTimeout(() => target.classList.remove('sent'), 180);
      return;
    }
    actions[target.dataset.action]?.();
  });
  return { place };
}
