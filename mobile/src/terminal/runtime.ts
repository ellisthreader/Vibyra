import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { plainPunctuation } from './composerInput';
import { clampFontSize, DEFAULT_FONT_SIZE, fontSizeFor, MAX_FONT_SIZE, MIN_FONT_SIZE } from './fontFit';
import { MirrorStage, parseGrid, type Grid } from './mirror';
import { PinchZoom, type ZoomTarget } from './pinchZoom';
import { TapToType } from './tapToType';

// `ui-monospace` is SF Mono on an iPhone, the face its own system uses for
// code; Menlo is the fallback everywhere else, including the browser harness.
const family = 'ui-monospace, Menlo, Monaco, Consolas, monospace';
const terminal = new Terminal({
  fontFamily: family, fontSize: DEFAULT_FONT_SIZE, lineHeight: 1.25,
  cursorBlink: false, scrollback: 3000, allowProposedApi: true,
  screenReaderMode: true, convertEol: false, disableStdin: true,
  // A backstop, not the palette: `ansi.ts` carries colours that already pass on
  // both grounds, and this lifts whatever a tool picks that still would not —
  // ANSI black used as a foreground, or a truecolor escape close to the ground.
  minimumContrastRatio: 4.5,
  theme: { background: '#101115', foreground: '#F5F7FA', cursor: '#5B7CFA' },
});
const fit = new FitAddon();
terminal.loadAddon(fit);
// Without the Unicode 11 tables xterm measures ✅ and ⚠️ as one cell instead of
// two, then squeezes the glyph with negative letter-spacing so it paints over
// the next character. Box borders came out with a different right edge on every
// row that contained one. `allowProposedApi` above is what this addon needs.
const unicode = new Unicode11Addon();
terminal.loadAddon(unicode);
terminal.unicode.activeVersion = '11';
// `view` is the box the person scrolls and pinches; the terminal itself lives
// on `stage`, which a mirrored Mac grid scales inside `frame` (see below).
const view = document.getElementById('terminal')!;
const frame = document.getElementById('frame')!;
const stage = document.getElementById('stage')!;
terminal.open(stage);
// Browser clients use xterm's textarea. Native clients use NativeTerminalInput
// and keep this WebView as an output renderer; only the computer's echo is drawn.
const input = terminal.textarea;
input?.setAttribute('autocorrect', 'off');
input?.setAttribute('autocapitalize', 'off');
input?.setAttribute('autocomplete', 'off');
input?.setAttribute('spellcheck', 'false');
input?.setAttribute('enterkeyhint', 'enter');
let enabled = false;
const nativeKeyboard = 'ReactNativeWebView' in window;
let keyboardFocused = false;
// The type size a person chose by pinching, kept across reloads of this view.
let preferred = DEFAULT_FONT_SIZE;
// True while history is being laid out at the computer's width, so that
// width is never reported back as if this phone had asked for it, and no
// refit shrinks the grid before the replay has finished writing into it.
let replaying = false;
let atBottom = true;
const post = (payload: unknown) => {
  const message = JSON.stringify({ target: 'vibyra-terminal', ...payload as object });
  const native = (window as unknown as { ReactNativeWebView?: { postMessage(value: string): void } }).ReactNativeWebView;
  if (native) native.postMessage(message); else parent.postMessage(message, '*');
};
terminal.onData(data => { if (enabled && !nativeKeyboard) post({ type: 'input', data: plainPunctuation(data) }); });
// Report the grid whenever this phone laid it out, whether or not it can type
// into it: a Host sizes the program to the viewer. A mirrored Mac grid is the
// Mac's own and is never reported as if this phone had asked for it.
terminal.onResize(({ cols, rows }) => { if (!replaying && !mirror.active) post({ type: 'resize', cols, rows }); });

/** Whether the newest line is already in view, so following it is what a reader wants. */
const following = () =>
  terminal.buffer.active.viewportY >= terminal.buffer.active.baseY - 1 && mirror.cursorVisible();
/** Tells the phone when the reader leaves or returns to the newest line. */
function reportFollow() {
  const now = following();
  if (now === atBottom) return;
  atBottom = now;
  post({ type: 'follow', atBottom });
}
terminal.onScroll(reportFollow);
// A finger scrolling the rows never reaches `onScroll`: xterm suppresses its
// own event for a scroll that came from the viewport element, so the element
// is listened to directly. Asked after the dispatch, so xterm's own handler
// has moved the buffer by the time this one looks where it is.
view.addEventListener('scroll', () => queueMicrotask(reportFollow), true);
// Scroll events are coalesced per frame, and one that lands in the same frame
// as xterm's own programmatic sync is swallowed as that sync. Two integers
// compared four times a second is cheaper than a pill that is ever wrong.
setInterval(reportFollow, 250);

// A Mac pane's own grid, while one is shown: the terminal *is* that grid,
// scaled on the stage, and the pane on the Mac is never resized from here.
const mirror = new MirrorStage(terminal, view, frame, stage, reportFollow);
/** Lays the terminal out for `view` at the current type size and follows the tail. */
function refit(follow: boolean) {
  if (mirror.active) { mirror.layout(follow); if (keyboardFocused) mirror.revealCursor(); return; }
  const width = view.clientWidth;
  if (width <= 0 || replaying) return;
  const size = fontSizeFor(width, family, preferred);
  if (terminal.options.fontSize !== size) terminal.options.fontSize = size;
  fit.fit();
  if (follow) terminal.scrollToBottom();
  reportFollow();
}

/** A pinch over a Host's terminal: the type size, and with it the column count. */
const sizing: ZoomTarget = {
  current: () => preferred, clamp: clampFontSize,
  apply(size) { preferred = size; refit(true); post({ type: 'font-size', size }); },
  // Toward the middle of the range from wherever we are, so both a too-small
  // and a too-large grid come back with the same gesture.
  reset() { sizing.apply(clampFontSize(preferred <= (MIN_FONT_SIZE + MAX_FONT_SIZE) / 2 ? preferred + 2 : preferred - 2), { x: 0, y: 0 }); },
};
new PinchZoom(view, () => mirror.active ? mirror.zooming : sizing);
// Native taps request focus from the React Native input (including after a
// pending control claim). Browser taps toggle xterm's own input synchronously.
new TapToType(view, () => {
  post({ type: 'tap' });
  if (nativeKeyboard || !enabled || !input) return;
  if (document.activeElement === input) input.blur(); else input.focus();
}, at => (mirror.active ? mirror.zooming : sizing).reset(at));
new ResizeObserver(() => refit(following())).observe(document.body);

function applyState(data: { disabled?: boolean; fontSize?: number; grid?: Partial<Grid>; theme?: { background: string } }) {
  const nextEnabled = data.disabled === false;
  const changedControl = nextEnabled && !enabled;
  enabled = nextEnabled;
  terminal.options.disableStdin = !enabled || nativeKeyboard;
  if (!enabled) input?.blur();
  if (typeof data.fontSize === 'number' && data.fontSize !== preferred) preferred = data.fontSize;
  mirror.set(parseGrid(data.grid));
  if (data.theme) {
    terminal.options.theme = data.theme;
    // Both elements: `html` carries the ground behind an overscroll bounce, and
    // leaving it on the stylesheet's guess showed the other theme there.
    document.body.style.background = data.theme.background;
    document.documentElement.style.background = data.theme.background;
  }
  refit(following());
  if (changedControl && !mirror.active) post({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
}

function applyOutput(data: { data?: string; reset?: boolean; grid?: Grid }) {
  if (typeof data.data !== 'string') return;
  // Decide before writing: afterwards the new rows have already moved the
  // viewport, so a reader who had scrolled up would be yanked to the bottom
  // on every frame of a busy run and could never read anything.
  const follow = data.reset || following();
  if (data.reset) {
    terminal.reset();
    // History was drawn for the computer's grid. Laid out at that width and
    // then shrunk, xterm reflows the long lines; poured straight into a phone
    // grid, every line of it wrapped mid-word and a full-screen tool's frames
    // stacked on top of one another. A mirrored grid is already that width.
    const { grid } = data;
    if (!mirror.active && grid && Number.isInteger(grid.cols) && Number.isInteger(grid.rows) && grid.cols > terminal.cols) {
      replaying = true;
      terminal.resize(Math.min(grid.cols, 500), Math.min(Math.max(grid.rows, terminal.rows), 200));
    }
  }
  terminal.write(data.data, () => {
    post({ type: 'paste-mode', enabled: terminal.modes.bracketedPasteMode });
    replaying = false;
    if (data.reset) refit(true);
    else if (follow) terminal.scrollToBottom();
    if (follow) mirror.revealCursor(keyboardFocused);
    reportFollow();
  });
}

function receive(event: MessageEvent) {
  if (typeof event.data !== 'string') return;
  if (event.source && event.source !== parent && event.source !== window) return;
  let data;
  try { data = JSON.parse(event.data); } catch { return; }
  if (data.target !== 'vibyra-terminal') return;
  if (data.type === 'state') applyState(data);
  else if (data.type === 'output') applyOutput(data);
  else if (data.type === 'scroll') { terminal.scrollToBottom(); mirror.revealCursor(); reportFollow(); }
  else if (data.type === 'keyboard') {
    keyboardFocused = data.focused === true;
    if (keyboardFocused) { terminal.scrollToBottom(); mirror.revealCursor(); }
  }
}
window.addEventListener('message', receive);
document.addEventListener('message', receive as EventListener);
refit(true);
post({ type: 'ready' });
