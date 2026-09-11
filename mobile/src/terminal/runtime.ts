import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { outputDelta } from './outputDelta';
import { DEFAULT_FONT_SIZE, fontSizeFor } from './fontFit';
import { PinchZoom } from './pinchZoom';

const family = 'Menlo, Monaco, Consolas, monospace';
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
const view = document.getElementById('terminal')!;
terminal.open(view);
let previous = '';
let enabled = false;
// The type size a person chose by pinching, kept across reloads of this view.
let preferred = DEFAULT_FONT_SIZE;
const post = (payload: unknown) => {
  const message = JSON.stringify({ target: 'vibyra-terminal', ...payload as object });
  const native = (window as unknown as { ReactNativeWebView?: { postMessage(value: string): void } }).ReactNativeWebView;
  if (native) native.postMessage(message); else parent.postMessage(message, '*');
};
terminal.onData(data => { if (enabled) post({ type: 'input', data }); });
// Always report the grid, whether or not this phone can type into it. The
// computer sizes the program to the viewer, so the number matters even when
// the viewer is only watching — that is the whole point of reporting it.
terminal.onResize(({ cols, rows }) => post({ type: 'resize', cols, rows }));

/** Lays the terminal out for `view` at the current type size and follows the tail. */
function refit(atBottom: boolean) {
  const width = view.clientWidth;
  if (width <= 0) return;
  const size = fontSizeFor(width, family, preferred);
  if (terminal.options.fontSize !== size) terminal.options.fontSize = size;
  fit.fit();
  if (atBottom) terminal.scrollToBottom();
}
/** Whether the newest line is already in view, so following it is what a reader wants. */
const following = () =>
  terminal.buffer.active.viewportY >= terminal.buffer.active.baseY - 1;

new PinchZoom(view, () => preferred, size => {
  preferred = size;
  refit(true);
  post({ type: 'font-size', size });
});
new ResizeObserver(() => refit(following())).observe(document.body);
function receive(event: MessageEvent) {
  if (typeof event.data !== 'string') return;
  if (event.source && event.source !== parent && event.source !== window) return;
  let data;
  try { data = JSON.parse(event.data); } catch { return; }
  if (data.target !== 'vibyra-terminal' || data.type !== 'state') return;
  const nextEnabled = data.disabled === false;
  const changedControl = nextEnabled && !enabled;
  enabled = nextEnabled;
  terminal.options.disableStdin = !enabled;
  if (typeof data.fontSize === 'number' && data.fontSize !== preferred) {
    preferred = data.fontSize;
  }
  if (data.theme) {
    terminal.options.theme = data.theme;
    // Both elements: `html` carries the ground behind an overscroll bounce, and
    // leaving it on the stylesheet's guess showed the other theme there.
    document.body.style.background = data.theme.background;
    document.documentElement.style.background = data.theme.background;
  }
  if (typeof data.output === 'string' && previous !== data.output) {
    // Decide before writing: afterwards the new rows have already moved the
    // viewport, so a reader who had scrolled up would be yanked to the bottom
    // on every frame of a busy run and could never read anything.
    const atBottom = following();
    const change = outputDelta(previous, data.output);
    if (change.reset) terminal.reset();
    terminal.write(change.data, () => {
      post({ type: 'paste-mode', enabled: terminal.modes.bracketedPasteMode });
      if (atBottom) terminal.scrollToBottom();
    });
    previous = data.output;
  }
  refit(following());
  if (changedControl) post({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
}
window.addEventListener('message', receive);
document.addEventListener('message', receive as EventListener);
refit(true);
post({ type: 'ready' });
