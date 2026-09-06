import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { outputDelta } from './outputDelta';

const terminal = new Terminal({
  fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: 13, lineHeight: 1.3,
  cursorBlink: false, scrollback: 3000, allowProposedApi: false,
  screenReaderMode: true, convertEol: false, disableStdin: true,
  theme: { background: '#101115', foreground: '#F5F7FA', cursor: '#5B7CFA' },
});
const fit = new FitAddon();
terminal.loadAddon(fit);
terminal.open(document.getElementById('terminal')!);
let previous = '';
let enabled = false;
const post = (payload: unknown) => {
  const message = JSON.stringify({ target: 'vibyra-terminal', ...payload as object });
  const native = (window as unknown as { ReactNativeWebView?: { postMessage(value: string): void } }).ReactNativeWebView;
  if (native) native.postMessage(message); else parent.postMessage(message, '*');
};
terminal.onData(data => { if (enabled) post({ type: 'input', data }); });
terminal.onResize(({ cols, rows }) => { if (enabled) post({ type: 'resize', cols, rows }); });
const refit = () => { if (document.body.clientWidth > 0) fit.fit(); };
new ResizeObserver(refit).observe(document.body);
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
  if (data.theme) {
    terminal.options.theme = data.theme;
    document.body.style.background = data.theme.background;
  }
  if (typeof data.output === 'string' && previous !== data.output) {
    const change = outputDelta(previous, data.output);
    if (change.reset) terminal.reset();
    terminal.write(change.data, () => post({ type: 'paste-mode', enabled: terminal.modes.bracketedPasteMode }));
    previous = data.output;
  }
  refit();
  if (changedControl) post({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
}
window.addEventListener('message', receive);
document.addEventListener('message', receive as EventListener);
refit();
post({ type: 'ready' });
