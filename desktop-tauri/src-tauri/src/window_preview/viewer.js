// A single in-flight binary image request: slow routes reduce frame rate instead
// of accumulating stale frames. This trusted document is the only input surface.
import { createControls } from './viewer-controls.js';
import { watchGestures } from './viewer-gestures.js';
import { createSender } from './viewer-input.js';
import { createKeyboard } from './viewer-keyboard.js';
import { createZoom } from './viewer-zoom.js';

const screen = document.querySelector('#screen');
const state = document.querySelector('#state');
const problem = document.querySelector('#problem');
const turn = document.querySelector('#turn');
const canControl = document.body.dataset.control === 'true';
let live = false, active = true, last = '', failures = 0, quiet = 0, dismissed = false, accessWarned = false, saidAt = 0, frameProblem = false;
const notify = (kind, detail) => window.ReactNativeWebView?.postMessage(JSON.stringify({ preview: 1, kind, detail, url: location.href }));
// A message stays long enough to read; a frame problem clears once frames return.
const say = (text, fromFrames = false) => { problem.textContent = text; saidAt = Date.now(); frameProblem = fromFrames; };
const sender = createSender({
  onReply: (reply, event) => focusChanged(reply.focus, event.kind === 'click'),
  onProblem: say,
});
const zoom = createZoom(screen);
let controls = null;
const keyboard = createKeyboard({ sender, screen, zoom, onChange: () => { suggestTurn(); controls?.place(); } });
controls = createControls({ keyboard, zoom, canControl, notify });
addEventListener('resize', () => zoom.refit());
function status(text, paused = false) {
  state.textContent = text; state.classList.toggle('paused', paused); state.classList.remove('quiet');
  clearTimeout(quiet);
  if (!paused) quiet = setTimeout(() => state.classList.add('quiet'), 2500);
}
// A wide window on an upright phone is shown small: suggest turning it.
function suggestTurn() {
  const wide = screen.naturalWidth > screen.naturalHeight * 1.15;
  turn.hidden = dismissed || !live || !wide || innerWidth > innerHeight || keyboard.open;
}
addEventListener('resize', suggestTurn);
document.querySelector('#dismiss').addEventListener('click', () => { dismissed = true; suggestTurn(); });
function focusChanged(focus, tapped = false) {
  if (!focus) return;
  if (focus.access === false && !accessWarned) {
    accessWarned = true;
    say('To tap and type from your phone, turn on Vibyra in System Settings › Privacy & Security › Accessibility on your Mac.');
  }
  keyboard.update(focus, { tap: tapped });
}
function decodeFocus(header) {
  if (!header) return null;
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(header), c => c.charCodeAt(0)))); } catch { return null; }
}
async function frames() {
  while (active) {
    if (document.hidden) { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
    try {
      const response = await fetch('/frame', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(await response.text());
      const focus = decodeFocus(response.headers.get('x-vibyra-focus'));
      const url = URL.createObjectURL(await response.blob());
      const decoded = new Image(); decoded.src = url;
      try { await decoded.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
      screen.src = url;
      if (last) URL.revokeObjectURL(last);
      last = url; failures = 0;
      if (frameProblem || Date.now() - saidAt > 5000) say('');
      if (!live) {
        const acknowledged = await fetch('/ready', { method: 'POST', headers: { 'x-vibyra-window': '1' }, signal: AbortSignal.timeout(8000) });
        if (!acknowledged.ok) throw new Error(await acknowledged.text());
        live = true; notify('ready');
        status('Live · Running on your ' + (document.body.dataset.host || 'computer'));
      }
      focusChanged(focus);
      suggestTurn();
    } catch (error) {
      live = false; status('Window Preview paused', true); say(error.message, true); suggestTurn();
      if (++failures >= 20) { notify('failed', error.message); break; }
    }
    await new Promise(resolve => setTimeout(resolve, failures ? 400 : 125));
  }
}
// The picture is letterboxed inside the element: map a point onto the picture
// itself; points on the empty bands around it are not on the window.
function windowPoint(clientX, clientY) {
  const box = screen.getBoundingClientRect();
  if (!box.width || !box.height || !screen.naturalWidth) return null;
  const scale = Math.min(box.width / screen.naturalWidth, box.height / screen.naturalHeight);
  const width = screen.naturalWidth * scale, height = screen.naturalHeight * scale;
  const left = box.left + (box.width - width) / 2, top = box.top + (box.height - height) / 2;
  const x = (clientX - left) / width, y = (clientY - top) / height;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y, scale };
}
function tapAt(clientX, clientY, right = false) {
  const point = windowPoint(clientX, clientY);
  if (!point || !live) return;
  // Never ignore a tap silently: say why it cannot reach the window.
  if (!canControl) { say('This phone can only view this window. Close Preview and choose View this window again to tap in it.'); return; }
  const ring = document.createElement('div');
  ring.className = 'tap'; ring.style.left = clientX + 'px'; ring.style.top = clientY + 'px';
  document.body.append(ring); setTimeout(() => ring.remove(), 500);
  // Still inside the tap: iOS raises the keyboard only now.
  if (!right) keyboard.tap(point.x, point.y);
  sender.push({ kind: 'click', x: point.x, y: point.y, right });
}
// A moving finger scrolls the window where it first touched, in window pixels.
function scrollAt(clientX, clientY, moved) {
  const point = windowPoint(clientX, clientY);
  if (!point || !canControl || !live) return;
  sender.push({ kind: 'scroll', x: point.x, y: point.y, delta: Math.max(-600, Math.min(600, Math.round(moved / point.scale))) });
}
watchGestures(screen, { tap: tapAt, scroll: scrollAt, zoom });
addEventListener('pagehide', () => { active = false; if (last) URL.revokeObjectURL(last); });
void frames();
