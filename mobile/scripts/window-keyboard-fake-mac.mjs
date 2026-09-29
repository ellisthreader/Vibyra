// A stand-in for the computer in a window Preview: serves the real viewer
// files with the production headers, renders window-keyboard-app.html in
// headless Chromium for frames, reports keyboard focus from that page's DOM
// (in place of the Accessibility layer) and applies the phone's taps and keys.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const viewer = new URL('../../desktop-tauri/src-tauri/src/window_preview/', import.meta.url);
const here = new URL('.', import.meta.url);
const W = 900, H = 640;
const csp = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const KEYS = { enter: 'Enter', tab: 'Tab', shiftTab: 'Shift+Tab', escape: 'Escape', backspace: 'Backspace', delete: 'Delete',
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', pageUp: 'PageUp', pageDown: 'PageDown' };
const IDS = ['email', 'password', 'notes', 'signin', 'later', 'search', 'prefilled', 'rich', 'ro', 'out'];

export async function startFakeMac(port) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const app = () => page.setContent(readFileSync(new URL('window-keyboard-app.html', here), 'utf8'));
  await app();
  let serial = 0, last = '', sequence = 0, probe = null, served = '';
  const inputs = [];

  async function focusState() {
    const s = await page.evaluate(({ W, H }) => {
      const frac = r => [r.left / W, r.top / H, r.width / W, r.height / H].map(v => Math.round(v * 10000) / 10000);
      const kindOf = el => el.type === 'password' ? 'secure' : el.type === 'search' ? 'search'
        : el.tagName === 'TEXTAREA' || el.isContentEditable ? 'multiline' : ['email', 'tel', 'url'].includes(el.type) ? el.type : 'text';
      const editable = el => !!el && ((el.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio'].includes(el.type) && !el.readOnly && !el.disabled)
        || (el.tagName === 'TEXTAREA' && !el.readOnly) || el.isContentEditable);
      const a = document.activeElement, ok = editable(a);
      const fields = [...document.querySelectorAll('input,textarea,[contenteditable]')].filter(editable).map(el => [...frac(el.getBoundingClientRect()), kindOf(el)]);
      return { id: a?.id || 'body', editable: ok, kind: ok ? kindOf(a) : 'text', field: ok ? frac(a.getBoundingClientRect()) : undefined,
        label: ok ? (a.labels?.[0]?.textContent?.trim() || a.placeholder || '') : undefined, empty: ok ? !(a.value ?? a.textContent) : undefined, fields };
    }, { W, H });
    const key = `${s.id}|${s.kind}|${s.editable}`;
    if (key !== last) { last = key; serial++; }
    const { id, ...rest } = s;
    return { v: 1, access: true, front: true, serial, ...rest };
  }

  async function apply(event) {
    if (event.kind === 'click') return page.mouse.click(event.x * W, event.y * H, { button: event.right ? 'right' : 'left' });
    if (event.kind === 'scroll') { await page.mouse.move(event.x * W, event.y * H); return page.mouse.wheel(0, -event.delta); }
    const actions = event.kind === 'keys' ? event.actions : event.kind === 'text' ? [{ text: event.text }] : [{ key: event.key }];
    for (const action of actions) {
      if (action.text !== undefined) await page.keyboard.insertText(action.text);
      else for (let i = 0; i < (action.repeat ?? 1); i++) await page.keyboard.press(KEYS[action.key]);
    }
  }

  const server = createServer((req, res) => handle(req, res).catch(error => {
    // A slow headless browser is a failed frame, as on a busy computer; never a crash.
    if (!res.headersSent) { res.writeHead(409, { 'content-type': 'text/plain' }); res.end(String(error.message).slice(0, 200)); }
  }));
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const send = (status, type, body, extra = {}) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': csp, ...extra }); res.end(body); };
    let body = ''; for await (const chunk of req) body += chunk;
    if (url.pathname === '/') {
      sequence = 0; probe = null; served = url.search; // A new viewer is a new session, as on the computer.
      const html = readFileSync(new URL('viewer.html', viewer), 'utf8').replace('data-host="computer"', 'data-host="Mac"').replace('data-control="false"', 'data-control="true"')
        .replace('<script type="module" src="/viewer.js"></script>', '<script src="/probe.js"></script><script type="module" src="/viewer.js"></script>');
      return send(200, 'text/html; charset=utf-8', html);
    }
    if (url.pathname === '/probe.js') return send(200, 'text/javascript', readFileSync(new URL('window-keyboard-probe.js', here)));
    if (/^\/viewer(-[a-z]+)?\.js$/.test(url.pathname)) return send(200, 'text/javascript; charset=utf-8', readFileSync(new URL(url.pathname.slice(1), viewer)));
    if (url.pathname === '/frame') {
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 70 });
      return send(200, 'image/jpeg', jpeg, { 'x-vibyra-focus': Buffer.from(JSON.stringify(await focusState())).toString('base64') });
    }
    if (url.pathname === '/ready') return send(200, 'application/json', '{"ok":true}');
    if (url.pathname === '/input' && req.headers['x-vibyra-window'] === '1') {
      const event = JSON.parse(body);
      if (event.sequence <= sequence) return send(409, 'text/plain', 'Window input arrived out of order. Try again.');
      sequence = event.sequence; inputs.push(event);
      const before = (await focusState()).serial;
      await apply(event);
      let focus = await focusState();
      for (let i = 0; i < 7 && event.kind === 'click' && focus.serial === before; i++) { await new Promise(r => setTimeout(r, 30)); focus = await focusState(); }
      return send(200, 'application/json', JSON.stringify({ ok: true, focus }));
    }
    if (url.pathname === '/probe-log') {
      // Only the viewer served last reports; an older page left open is ignored.
      const report = JSON.parse(body);
      if (report.page === served) probe = report;
      return send(200, 'text/plain', 'ok');
    }
    send(404, 'text/plain', 'Window Preview route unavailable');
  }
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    async debug() {
      const rects = await page.evaluate(({ W, H, IDS }) => Object.fromEntries(IDS.map(id => { const r = document.getElementById(id).getBoundingClientRect();
        return [id, [(r.left + r.width / 2) / W, (r.top + r.height / 2) / H]]; }).concat([['blank', [0.33, 0.06]]])), { W, H, IDS });
      const values = await page.evaluate(() => ({ email: email.value, password: password.value, notes: notes.value, search: search.value,
        prefilled: prefilled.value, rich: rich.textContent, out: out.textContent, active: document.activeElement?.id || 'body' }));
      return { values, rects, inputs: inputs.length, lastInput: inputs.at(-1), probe };
    },
    resetApp: app,
    async close() { await new Promise(resolve => server.close(resolve)); await browser.close(); },
  };
}
