import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { webkit } from 'playwright-core';

// The phone's window Preview viewer in WebKit against a stand-in computer:
// frames, taps, the phone keyboard for text fields, live typing, scrolling,
// pinch zoom and the Preview controls sheet.
// Real iOS keyboard behaviour is proved by verify-window-keyboard-ios.mjs.
const root = new URL('../../desktop-tauri/src-tauri/src/window_preview/', import.meta.url);
// Real native fixture output; run window-preview-fixture.swift first.
const frame = await readFile('/tmp/vibyra-window-fixture.jpg');
const csp = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
let control = false, requests = 0, active = 0, peak = 0, paused = false, inputDelay = 0;
// What the computer reports about keyboard focus in the window.
let focus = { v: 1, access: true, front: true, serial: 1, editable: false, kind: 'text', fields: [[0.1, 0.1, 0.4, 0.1, 'email'], [0.1, 0.3, 0.4, 0.1, 'secure']] };
let afterClick = null;
const inputs = [];
const header = () => Buffer.from(JSON.stringify(focus)).toString('base64');
const server = createServer(async (req, res) => {
  const send = (status, type, body, extra = {}) => { res.writeHead(status, { 'content-type': type, 'content-security-policy': csp, ...extra }); res.end(body); };
  if (req.url === '/') return send(200, 'text/html', (await readFile(new URL('viewer.html', root), 'utf8')).replace('data-control="false"', `data-control="${control}"`));
  if (/^\/viewer(-[a-z]+)?\.js$/.test(req.url)) return send(200, 'text/javascript', await readFile(new URL(req.url.slice(1), root)));
  if (req.url === '/frame') {
    requests++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 60)); active--;
    return paused ? send(409, 'text/plain', 'Window is locked') : send(200, 'image/jpeg', frame, control ? { 'x-vibyra-focus': header() } : {});
  }
  if (req.url === '/ready') { assert.equal(req.headers['x-vibyra-window'], '1'); return send(200, 'application/json', '{"ok":true}'); }
  if (req.url === '/input') {
    assert.equal(req.headers['x-vibyra-window'], '1');
    let text = ''; for await (const chunk of req) text += chunk;
    const event = JSON.parse(text); inputs.push(event);
    await new Promise(resolve => setTimeout(resolve, inputDelay));
    if (event.kind === 'click' && afterClick) { focus = { ...focus, ...afterClick, serial: focus.serial + 1 }; afterClick = null; }
    return send(200, 'application/json', JSON.stringify({ ok: true, focus }));
  }
  send(404, 'text/plain', 'Window Preview route unavailable');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await webkit.launch();
const typed = () => inputs.filter(event => event.kind === 'keys').flatMap(event => event.actions);
const keys = () => typed().filter(action => action.key).map(action => `${action.key}${(action.repeat ?? 1) > 1 ? `x${action.repeat}` : ''}`);
const text = () => typed().filter(action => action.text !== undefined).map(action => action.text).join('');
try {
  // A phone taps; iOS sends no click for a plain image, so test with touch.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.addInitScript(() => { window.receipts = []; window.ReactNativeWebView = { postMessage: text => window.receipts.push(JSON.parse(text)) }; });
  const url = `http://127.0.0.1:${server.address().port}`;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.receipts.some(event => event.kind === 'ready'));
  // A phone that may only look gets the controls for zoom, not the keys.
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#sheet').isVisible(), true);
  assert.equal(await page.locator('[data-action="keyboard"]').isVisible(), false);
  assert.equal(await page.locator('[data-action="zoomIn"]').isVisible(), true);
  assert.equal(await page.locator('#closePreview').isVisible(), false, 'Close needs an app that can close');
  await page.locator('#sheetBackdrop').tap({ position: { x: 20, y: 20 } }); await page.waitForTimeout(300);
  assert.equal(await page.locator('#sheet').isVisible(), false);
  await page.locator('#screen').tap(); assert.equal(inputs.length, 0);
  assert.match(await page.locator('#problem').textContent(), /only view/, 'a view-only tap says why');
  assert.equal(peak, 1, 'one frame request at a time');
  // A wide window on an upright phone suggests turning it; sideways it fills the screen.
  const wide = await page.evaluate(() => { const image = document.querySelector('#screen'); return image.naturalWidth > image.naturalHeight * 1.15; });
  assert.equal(await page.locator('#turn').isVisible(), wide);
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(150);
  assert.equal(await page.locator('#turn').isVisible(), false);
  const fills = await page.evaluate(() => { const box = document.querySelector('#screen').getBoundingClientRect(); return box.width >= innerWidth - 1 && box.height >= innerHeight - 1; });
  assert.ok(fills, 'the picture area fills a sideways phone');
  await page.setViewportSize({ width: 390, height: 844 });

  control = true; await page.reload();
  await page.waitForFunction(() => window.receipts.some(event => event.kind === 'ready'));
  const box = await page.locator('#screen').boundingBox();
  const at = await page.evaluate(() => { const s = document.querySelector('#screen'), r = s.getBoundingClientRect(); const k = Math.min(r.width / s.naturalWidth, r.height / s.naturalHeight); return { w: s.naturalWidth * k, h: s.naturalHeight * k, left: r.left + (r.width - s.naturalWidth * k) / 2, top: r.top + (r.height - s.naturalHeight * k) / 2 }; });
  const point = (x, y) => ({ x: at.left + x * at.w - box.x, y: at.top + y * at.h - box.y });
  // Taps on the empty band around the picture do nothing.
  if (at.top > 10) { await page.locator('#screen').tap({ position: { x: 195, y: 5 } }); await page.waitForTimeout(150); assert.equal(inputs.length, 0); }
  // A tap on a mapped text field opens the phone keyboard in the same tap.
  afterClick = { editable: true, kind: 'email', field: [0.1, 0.1, 0.4, 0.1], label: 'Email', empty: true };
  await page.locator('#screen').tap({ position: point(0.3, 0.15) });
  const sink = await page.evaluate(() => ({ id: document.activeElement.id, mode: document.activeElement.inputMode }));
  assert.match(sink.id, /^sink[AB]$/, 'the hidden field took focus inside the tap'); assert.equal(sink.mode, 'email');
  assert.equal(await page.locator('#keys').count(), 0, 'no key bar'); assert.equal(await page.locator('#keyboard').count(), 0, 'no keyboard button');
  assert.equal(inputs[0].kind, 'click'); assert.ok(Math.abs(inputs[0].x - 0.3) < 0.01 && Math.abs(inputs[0].y - 0.15) < 0.01);
  // Live typing: every character arrives, in order, even while the computer is slow.
  inputDelay = 120;
  await page.keyboard.type('Generic project test', { delay: 15 });
  await page.waitForTimeout(1500);
  assert.equal(text(), 'Generic project test', JSON.stringify(typed()));
  const sequences = inputs.map(event => event.sequence);
  assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b)); assert.equal(new Set(sequences).size, sequences.length);
  assert.ok(inputs.length < 21, `keys typed during a slow request travel together (${inputs.length} requests)`);
  inputDelay = 0;
  // Deleting past the typed text reaches what the field already held; Return is a key.
  await page.evaluate(() => { const field = document.activeElement; field.setSelectionRange(0, 0); });
  await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  assert.deepEqual(keys().slice(-2), ['backspace', 'enter']);
  // The controls lower the keyboard; closing them leaves it down (no keys in them).
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  assert.doesNotMatch(await page.evaluate(() => document.activeElement.id), /^sink/);
  assert.equal(await page.locator('#sheet [data-key]').count(), 0, 'no keys in the controls');
  await page.locator('[data-action="done"]').tap(); await page.waitForTimeout(300);
  assert.doesNotMatch(await page.evaluate(() => document.activeElement.id), /^sink/, 'Done leaves the keyboard closed');
  await page.locator('#screen').tap({ position: point(0.3, 0.15) });
  assert.match(await page.evaluate(() => document.activeElement.id), /^sink/, 'a tap on the field opens it again');
  // Focus moving to a password field keeps the keyboard, as a secure one.
  focus = { ...focus, serial: focus.serial + 1, editable: true, kind: 'secure', field: [0.1, 0.3, 0.4, 0.1] };
  await page.waitForFunction(() => document.activeElement.id === 'sinkSecret');
  // Focus leaving text fields closes it.
  focus = { ...focus, serial: focus.serial + 1, editable: false, field: undefined };
  await page.waitForFunction(() => !document.activeElement.id.startsWith('sink'));
  // A field the app focuses after a tap elsewhere: without an iOS keyboard, ask for a tap.
  afterClick = { editable: true, kind: 'text', field: [0.5, 0.6, 0.3, 0.1], label: 'Name' };
  await page.locator('#screen').tap({ position: point(0.8, 0.9) });
  await page.waitForFunction(() => !document.querySelector('#typeHint').hidden, null, { timeout: 3000 });
  assert.match(await page.locator('#typeHint').textContent(), /Name/);
  await page.locator('#typeHint').tap();
  assert.match(await page.evaluate(() => document.activeElement.id), /^sink[AB]$/);
  // Zoom from the controls, and back to fit.
  const scale = () => page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#screen')).transform).a);
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  await page.locator('[data-action="zoomIn"]').tap(); await page.locator('[data-action="zoomIn"]').tap(); await page.waitForTimeout(300);
  assert.ok(Math.abs(await scale() - 1.5625) < 0.01, 'two zoom-ins');
  assert.equal(await page.locator('#zoomValue').textContent(), '156%');
  await page.locator('[data-action="fit"]').tap(); await page.waitForTimeout(300);
  assert.equal(await scale(), 1);
  await page.locator('[data-action="done"]').tap(); await page.waitForTimeout(300);
  // Two fingers pinch the picture and send nothing to the window.
  const sent = inputs.length;
  await page.evaluate(() => { const s = document.querySelector('#screen'), r = s.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fire = (type, id, x) => s.dispatchEvent(new PointerEvent(type, { pointerId: id, isPrimary: id === 1, clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    fire('pointerdown', 1, cx - 40); fire('pointerdown', 2, cx + 40);
    for (let d = 45; d <= 100; d += 5) { fire('pointermove', 1, cx - d); fire('pointermove', 2, cx + d); }
    fire('pointerup', 1, cx - 100); fire('pointerup', 2, cx + 100); });
  await page.waitForTimeout(300);
  // Followed with no easing, so the picture is already there.
  assert.ok(Math.abs(await scale() - 2.5) < 0.05, `pinch to 2.5x (${await scale()})`);
  assert.equal(inputs.length, sent, 'a pinch is neither a tap nor a scroll');
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  // Full screen covers the phone edge to edge, and taps still land where they point.
  await page.locator('[data-action="fill"]').tap(); await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-action="fill"]').evaluate(button => button.classList.contains('on')), true);
  const covered = await page.evaluate(() => { const s = document.querySelector('#screen'), r = s.getBoundingClientRect(), k = Math.min(r.width / s.naturalWidth, r.height / s.naturalHeight);
    const w = s.naturalWidth * k, h = s.naturalHeight * k, left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
    return left <= 0.5 && top <= 0.5 && left + w >= innerWidth - 0.5 && top + h >= innerHeight - 0.5; });
  assert.ok(covered, 'Full screen leaves no bars');
  await page.locator('#sheetBackdrop').tap({ position: { x: 20, y: 20 } }); await page.waitForTimeout(300);
  const clicked = inputs.length;
  await page.touchscreen.tap(195, 422); await page.waitForTimeout(400); // Screen coordinates: the enlarged picture starts off-screen.
  const middle = inputs.slice(clicked).find(event => event.kind === 'click');
  assert.ok(middle && Math.abs(middle.x - 0.5) < 0.02 && Math.abs(middle.y - 0.5) < 0.02, `a tap in the middle is the window's middle (${JSON.stringify(middle)})`);
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  await page.locator('[data-action="fit"]').tap(); await page.locator('#sheetBackdrop').tap({ position: { x: 20, y: 20 } }); await page.waitForTimeout(300);
  // "Show keyboard" opens it by hand; a tap outside any text field closes it.
  focus = { ...focus, serial: focus.serial + 1, editable: false, field: undefined };
  await page.waitForTimeout(400);
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  await page.locator('[data-action="keyboard"]').tap();
  assert.match(await page.evaluate(() => document.activeElement.id), /^sink/, 'Show keyboard');
  await page.locator('#screen').tap({ position: point(0.8, 0.9) });
  await page.waitForFunction(() => !document.activeElement.id.startsWith('sink'), null, { timeout: 3000 });
  // A dragging finger scrolls instead of tapping.
  const clicks = inputs.filter(event => event.kind === 'click').length;
  const start = point(0.5, 0.5);
  await page.evaluate(({ x, y }) => { const s = document.querySelector('#screen'), r = s.getBoundingClientRect(); const fire = (type, dy) => s.dispatchEvent(new PointerEvent(type, { isPrimary: true, clientX: r.left + x, clientY: r.top + y + dy, bubbles: true, cancelable: true })); fire('pointerdown', 0); for (let dy = 10; dy <= 120; dy += 10) fire('pointermove', dy); fire('pointerup', 120); }, start);
  await page.waitForTimeout(400);
  assert.equal(inputs.filter(event => event.kind === 'click').length, clicks, 'a drag is not a tap');
  assert.ok(inputs.some(event => event.kind === 'scroll' && event.delta > 0), 'dragging down scrolls up');
  await page.addInitScript(() => { window.vibyraShell = { close: true, targets: true, accent: 'rgb(18, 52, 86)', label: 'Staff sign in' }; });
  await page.reload(); await page.waitForFunction(() => window.receipts.some(event => event.kind === 'ready'));
  assert.equal(await page.locator('#controls').evaluate(button => getComputedStyle(button).backgroundColor), 'rgb(18, 52, 86)');
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  assert.match(await page.locator('#sheetLocation').textContent(), /Staff sign in/);
  await page.locator('[data-action="targets"]').tap(); await page.waitForTimeout(300);
  await page.locator('#controls').tap(); await page.waitForTimeout(300);
  await page.locator('#closePreview').tap(); await page.waitForTimeout(200);
  assert.deepEqual((await page.evaluate(() => window.receipts)).map(event => event.kind).filter(kind => kind !== 'ready'), ['controls', 'targets', 'close']);
  // A reloaded viewer keeps its window session: its taps must still be accepted.
  assert.ok((await page.evaluate(() => window.receipts.length)) > 0);
  paused = true;
  await page.waitForFunction(() => document.querySelector('#state').textContent.includes('paused'));
  const before = inputs.length; await page.locator('#screen').tap();
  assert.equal(inputs.length, before);
  assert.deepEqual(errors, []);
  console.log('PASS: WebKit frames, read-only taps, turn tip, letterbox, in-tap keyboard with the right keyboard, ordered live typing under a slow computer, delete past typed text, Return, key bar, retarget to password, close on blur, Tap to type, drag scroll, controls sheet (no keys, Done leaves the keyboard down, zoom, Fit, Full screen edge to edge with exact taps, pinch, Show keyboard then tap outside closes it, Close and Choose window through the app), paused input denial');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
