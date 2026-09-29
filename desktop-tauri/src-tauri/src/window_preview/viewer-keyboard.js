// The phone's own keyboard for the shared window. A hidden field takes the
// iOS keyboard and its edits become keystrokes (viewer-typing.js). iOS raises
// the keyboard only for a field focused during a tap, so a tap on a text field
// the computer has mapped opens it at once; the computer's focus reports then
// confirm, retarget or close it. A focus report that arrives after the tap
// opens it where the app allows that, otherwise "Tap to type" asks for a tap.
// Keys like Tab and Esc live in the Preview controls (viewer-controls.js).
import { planCaret, planEdit } from './viewer-typing.js';
import { createPan } from './viewer-pan.js';
import { createSinks } from './viewer-sinks.js';

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', PageUp: 'pageUp', PageDown: 'pageDown' };

export function createKeyboard({ sender, screen, zoom, onChange }) {
  const sinks = createSinks();
  const hint = document.querySelector('#typeHint');
  const pan = createPan(screen, zoom);
  let sink = null, shadow = '', caret = 0, composing = false, switching = false;
  let state = { serial: -1, editable: false, fields: [] }, opened = null, tappedAt = 0, closing = 0, checking = 0, retarget = null, held = false;

  const send = actions => { if (actions.length) sender.push({ kind: 'keys', actions }); };
  const raised = () => (globalThis.visualViewport?.height ?? innerHeight) < innerHeight - 120;
  const reset = () => { if (sink) sink.value = ''; shadow = ''; caret = 0; };

  function open(kind, empty, by, gesture) {
    clearTimeout(closing); clearTimeout(checking);
    hint.hidden = true; retarget = null;
    const next = sinks.pick(kind, empty, sink);
    // A field focused without a tap holds focus but no keyboard: in a tap,
    // focus it afresh so iOS raises the keyboard this time.
    const stale = gesture && document.activeElement === next && !raised();
    if (next !== sink || document.activeElement !== next || stale) {
      switching = true;
      if (stale) next.blur();
      next.value = '';
      next.focus({ preventScroll: true });
      switching = false;
      sink = next;
    }
    reset();
    opened = { serial: state.serial, by };
    place();
    onChange(true);
    // Without a tap iOS may refuse the keyboard; a tap on the hint opens it.
    if (!gesture) checking = setTimeout(() => { if (opened && !raised()) showHint(); }, 900);
  }

  const showHint = () => { hint.textContent = state.label ? `Tap to type in “${state.label}”` : 'Tap to type'; hint.hidden = false; };

  function close() {
    clearTimeout(closing); clearTimeout(checking);
    opened = null; retarget = null; hint.hidden = true;
    pan.reset();
    if (sink && document.activeElement === sink) sink.blur();
    onChange(false);
  }

  function fieldAt(x, y) {
    const inside = ([left, top, width, height]) => x >= left - 0.004 && x <= left + width + 0.004 && y >= top - 0.004 && y <= top + height + 0.004;
    if (state.editable && state.field && inside(state.field)) return { kind: state.kind, empty: state.empty };
    const hits = (state.fields ?? []).filter(entry => inside(entry)).sort((a, b) => a[2] * a[3] - b[2] * b[3]);
    return hits.length ? { kind: hits[0][4] ?? 'text' } : null;
  }

  /** A tap at window fractions, called while the finger lifts (a real tap for iOS). */
  function tap(x, y) {
    tappedAt = Date.now();
    const hit = fieldAt(x, y);
    if (hit) open(hit.kind, hit.empty, 'tap', true);
    else if (opened) reset(); // The tap moved the window's text cursor.
  }

  function update(next, { tap: afterTap = false } = {}) {
    if (!next || typeof next.serial !== 'number' || next.serial < state.serial) return;
    const moved = next.serial !== state.serial;
    state = next;
    if (moved) focusMoved();
    else if (afterTap && opened?.by === 'tap' && !state.editable) closeSoon();
    if (retarget && Date.now() - tappedAt > 2500) place();
    if (opened && state.editable) pan.keep(state.field, state.caret);
  }

  function focusMoved() {
    if (state.editable) {
      clearTimeout(closing);
      if (opened) {
        if (sinks.pick(state.kind, state.empty, sink) === sink) { reset(); opened.serial = state.serial; }
        // Moving focus before the keyboard is up cancels it: wait until it is.
        else if (raised() || Date.now() - tappedAt > 2500) open(state.kind, state.empty, opened.by, false);
        else retarget = { kind: state.kind, empty: state.empty };
      } else if (!held && Date.now() - tappedAt < 2500) open(state.kind, state.empty, 'focus', false);
      return;
    }
    // Focus left the text field. A keyboard opened by hand stays for canvas apps.
    if (opened && opened.by !== 'manual') closeSoon();
  }

  function closeSoon() {
    clearTimeout(closing);
    closing = setTimeout(() => { if (!state.editable) close(); }, 450);
  }

  function sync() {
    if (!sink || composing) return;
    const value = sink.value;
    if (value !== shadow) {
      const plan = planEdit(shadow, value, caret);
      shadow = value; caret = plan.caret;
      send(plan.actions);
    }
    const local = sink.selectionEnd;
    if (sink.selectionStart === local && local != null && local !== caret) { send(planCaret(shadow, caret, local)); caret = local; }
    if (shadow.length > 1500 && caret === shadow.length) reset();
  }

  function keydown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    const start = sink.selectionStart, end = sink.selectionEnd, length = sink.value.length;
    let key = KEYS[event.key];
    if ((key === 'left' && start > 0) || (key === 'right' && end < length)) key = null; // Moves within known text.
    if (event.key === 'Enter') key = 'enter';
    else if (event.key === 'Tab') key = event.shiftKey ? 'shiftTab' : 'tab';
    else if (event.key === 'Escape') key = 'escape';
    // Deleting past the typed text reaches what the field already held.
    else if (event.key === 'Backspace' && start === 0 && end === 0) key = 'backspace';
    else if (event.key === 'Delete' && start === length && end === length) key = 'delete';
    if (!key) return;
    event.preventDefault();
    sync();
    send([{ key }]);
    if (key !== 'backspace' && key !== 'delete') reset();
  }

  for (const field of sinks.all) {
    field.addEventListener('keydown', keydown);
    field.addEventListener('input', sync);
    field.addEventListener('compositionstart', () => { composing = true; });
    field.addEventListener('compositionend', () => { composing = false; sync(); });
    // The iOS Done button or a swipe down closes the keyboard.
    field.addEventListener('blur', () => { if (!switching && field === sink && opened) close(); });
  }
  document.addEventListener('selectionchange', () => { if (sink && document.activeElement === sink) sync(); });

  // The hint acts on release and never takes focus itself.
  hint.addEventListener('pointerdown', event => event.preventDefault());
  hint.addEventListener('touchend', event => event.preventDefault(), { passive: false });
  hint.addEventListener('pointerup', event => {
    event.preventDefault();
    const field = sink;
    if (!field) return;
    switching = true; field.blur(); switching = false;
    field.focus({ preventScroll: true });
    hint.hidden = true; place();
  });

  function place() {
    if (retarget && (raised() || Date.now() - tappedAt > 2500)) return open(retarget.kind, retarget.empty, opened?.by ?? 'focus', false);
    // The keyboard came after all (iOS can take over a second the first time).
    if (opened && raised()) hint.hidden = true;
    if (opened && state.editable) pan.keep(state.field, state.caret);
    onChange(!!opened);
  }
  globalThis.visualViewport?.addEventListener('resize', place);
  globalThis.visualViewport?.addEventListener('scroll', place);

  return {
    tap, update, close,
    /** From a tap in the Preview controls, so iOS always raises the keyboard. */
    openManual: () => open(state.editable ? state.kind : 'text', state.empty, 'manual', true),
    /** The Preview controls are open: focus changes wait for them. */
    hold: on => { held = on; },
    /** Back to typing after the Preview controls close (a tap, so iOS allows it). */
    resume: () => { if (state.editable) open(state.kind, state.empty, 'tap', true); },
    /** A key from the Preview controls; the window's cursor leaves the typed text. */
    press: key => { sync(); send([{ key }]); reset(); },
    get raised() { return !!opened && raised(); },
    get state() { return state; },
    get open() { return !!opened; },
  };
}
