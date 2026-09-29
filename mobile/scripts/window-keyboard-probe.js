// Test-only: reports the phone page's state, and a log of focus and keyboard
// events, to the stand-in computer.
const events = [];
const note = text => { events.push(`${Math.round(performance.now())} ${text}`); if (events.length > 60) events.shift(); };
document.addEventListener('focusin', event => note(`focusin ${event.target.id || event.target.tagName}`));
document.addEventListener('focusout', event => note(`focusout ${event.target.id || event.target.tagName}`));
document.addEventListener('pointerup', event => note(`pointerup ${event.target.id}`), true);
visualViewport.addEventListener('resize', () => note(`viewport ${Math.round(visualViewport.height)}`));
addEventListener('DOMContentLoaded', () => new MutationObserver(() => note(`hint ${document.querySelector('#typeHint').hidden ? 'hidden' : 'shown'}`))
  .observe(document.querySelector('#typeHint'), { attributes: true, attributeFilter: ['hidden'] }));
setInterval(() => {
  const q = s => document.querySelector(s);
  const rect = el => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
  const screen = q('#screen'), box = screen?.getBoundingClientRect(), active = document.activeElement;
  const sheet = {}; document.querySelectorAll('#sheet button').forEach(b => { sheet[b.dataset.key || b.dataset.action] = rect(b); });
  fetch('/probe-log', { method: 'POST', body: JSON.stringify({
    page: location.search, t: Date.now(), vv: Math.round(visualViewport.height), vvTop: Math.round(visualViewport.offsetTop), inner: innerHeight, width: innerWidth,
    active: active?.id || 'body', mode: active?.inputMode, type: active?.type, cap: active?.getAttribute?.('autocapitalize'), sinkValue: active?.value,
    sheet, sheetOpen: !q('#sheet').hidden, panel: rect(q('#panel')), controls: rect(q('#controls')), hint: rect(q('#typeHint')), hintText: q('#typeHint').textContent,
    problem: q('#problem').textContent, state: q('#state').textContent, transform: screen.style.transform, events,
    box: box && [box.left, box.top, box.width, box.height], natural: [screen.naturalWidth, screen.naturalHeight] }) }).catch(() => {});
}, 200);
