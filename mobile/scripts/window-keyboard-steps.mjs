// The steps verify-window-keyboard-ios.mjs runs: real taps and typing on the
// Simulator, checked against the fields of the app on the stand-in computer.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// iOS keys on a 402x874pt iPhone (measured; the keyboard sits at the bottom).
const SOFT = { backspace: [362, 722], ret: [350, 774], h: [240, 675], e: [100, 612], l: [357, 675], suggestion: [201, 564] };

export async function runSteps({ sim, mac, top }) {
  let failures = 0, offset = top;
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };
  const until = async (test, ms = 3000) => {
    const started = Date.now();
    while (Date.now() - started < ms) { const d = await mac.debug(); if (d.probe && test(d)) return { d, ms: Date.now() - started }; await sleep(100); }
    return { d: await mac.debug(), ms: -1 };
  };
  const raised = p => p.vv < p.inner - 120, onSink = p => p.active.startsWith('sink');
  // Where a point of the app window is on the Simulator screen.
  const point = (p, fx, fy) => {
    const [bl, bt, bw, bh] = p.box, [nw, nh] = p.natural, s = Math.min(bw / nw, bh / nh);
    return [bl + (bw - nw * s) / 2 + fx * nw * s, bt + (bh - nh * s) / 2 + fy * nh * s + offset];
  };
  // The picture and the controls sheet animate; tap once two fresh reports agree.
  const steady = async () => {
    let previous = '';
    for (let i = 0; i < 30; i++) { await sleep(220); const p = (await mac.debug()).probe, now = JSON.stringify([p.box, p.transform, p.vv, p.sheet, p.controls]); if (now === previous) return; previous = now; }
  };
  const tapApp = async (id, dx = 0) => { await steady(); const d = await mac.debug(); const [fx, fy] = d.rects[id]; sim.tap(...point(d.probe, fx + dx, fy)); };
  const tapRect = r => sim.tap(r[0] + r[2] / 2, r[1] + r[3] / 2 + offset);
  const tapControls = async () => { await steady(); tapRect((await mac.debug()).probe.controls); await until(d => d.probe.sheetOpen); await sleep(400); };
  const tapSheet = async name => { await steady(); tapRect((await mac.debug()).probe.sheet[name]); };
  const soft = name => sim.tap(...SOFT[name]);

  await mac.resetApp();
  let r = await until(d => d.probe.natural?.[0] > 0 && d.probe.state.includes('Live'), 20000);
  check(r.ms >= 0, `viewer live: ${r.d.probe?.state}`);
  for (let i = 0; i < 2; i++) { // Calibrate: tap a blank spot and see where it lands.
    const before = (await mac.debug()).inputs;
    await tapApp('blank');
    r = await until(d => d.inputs > before && d.lastInput?.kind === 'click');
    const [, , , bh] = r.d.probe.box, [nw, nh] = r.d.probe.natural;
    offset += Math.round((r.d.rects.blank[1] - r.d.lastInput.y) * nh * Math.min(r.d.probe.box[2] / nw, bh / nh));
  }
  await tapApp('email');
  r = await until(d => raised(d.probe) && onSink(d.probe) && d.values.active === 'email');
  check(r.ms >= 0 && r.d.probe.mode === 'email', `tap Email: keyboard up (${r.ms} ms), inputmode=${r.d.probe.mode}`);
  check(!!r.d.probe.transform && !!r.d.probe.controls, `picture moved to the field (${r.d.probe.transform}); controls button on screen`);
  sim.text('hello@vibyra.app');
  r = await until(d => d.values.email === 'hello@vibyra.app', 5000);
  check(r.ms >= 0, `typing arrived exactly: ${JSON.stringify(r.d.values.email)}`);
  for (let i = 0; i < 3; i++) { soft('backspace'); await sleep(250); }
  r = await until(d => d.values.email === 'hello@vibyra.');
  check(r.ms >= 0, `3 backspaces: ${JSON.stringify(r.d.values.email)}`);
  await tapApp('password');
  r = await until(d => d.values.active === 'password' && d.probe.type === 'password' && raised(d.probe));
  check(r.ms >= 0, 'password field keeps the keyboard, now secure');
  sim.text('s3cret!');
  r = await until(d => d.values.password === 's3cret!', 4000);
  check(r.ms >= 0, `password typed (${r.d.values.password.length} chars)`);
  soft('ret');
  r = await until(d => d.values.out.startsWith('Submitted'));
  check(r.ms >= 0, `Return submitted: ${JSON.stringify(r.d.values.out)}`);
  await tapApp('blank');
  r = await until(d => !raised(d.probe) && !onSink(d.probe));
  check(r.ms >= 0, 'a tap away from text fields closes the keyboard');
  await tapApp('notes');
  r = await until(d => raised(d.probe) && d.probe.active === 'sinkArea');
  sim.text('line one'); await sleep(400); soft('ret'); await sleep(400); sim.text('two');
  r = await until(d => d.values.notes === 'line one\ntwo', 4000);
  check(r.ms >= 0, `multi-line with Return: ${JSON.stringify(r.d.values.notes)}`);
  soft('ret'); await sleep(400); soft('h'); await sleep(300); soft('e'); await sleep(300); soft('l'); await sleep(1200); soft('suggestion');
  r = await until(d => /\n[hH]e\S+ $/.test(d.values.notes) && !/hel\S*he/i.test(d.values.notes));
  check(r.ms >= 0, `QuickType replaced the word once: ${JSON.stringify(r.d.values.notes)}`);
  await tapApp('search');
  r = await until(d => raised(d.probe) && d.values.active === 'search' && d.probe.mode === 'search');
  check(r.ms >= 0, 'search field gets a search keyboard');
  await tapApp('blank'); await until(d => !raised(d.probe));
  await tapApp('prefilled', 0.05);
  r = await until(d => raised(d.probe) && d.values.active === 'prefilled');
  soft('backspace'); await sleep(300); soft('backspace');
  r = await until(d => d.values.prefilled.length === 6);
  check(r.ms >= 0, `deleting past typed text reaches the field's own: ${JSON.stringify(r.d.values.prefilled)}`);
  await tapControls();
  r = await until(d => !raised(d.probe));
  check(r.ms >= 0, 'the Preview controls open and lower the keyboard');
  check(!(await mac.debug()).probe.sheet.tab, 'no keys in the controls');
  await tapSheet('done'); await sleep(1200);
  r = { d: await mac.debug() };
  check(!raised(r.d.probe) && !r.d.probe.sheetOpen, 'Done closes the controls and the keyboard stays down');
  await tapApp('rich');
  r = await until(d => d.probe.active === 'sinkArea' && raised(d.probe) && d.values.active === 'rich');
  check(r.ms >= 0, `rich note opens a multi-line keyboard (${r.d.probe.active})`);
  sim.text('Rich ok');
  r = await until(d => d.values.rich === 'Rich ok');
  check(r.ms >= 0, `rich text: ${JSON.stringify(r.d.values.rich)}`);
  await tapControls(); await steady(); const beforeZoom = (await mac.debug()).probe; await tapSheet('zoomIn');
  r = await until(d => /scale\(1\.25\)/.test(d.probe.transform));
  check(r.ms >= 0, `Zoom in from the controls (${r.d.probe.transform})`);
  if (r.ms < 0) console.log('  zoom debug', JSON.stringify({ zoomIn: beforeZoom.sheet.zoomIn, panel: beforeZoom.panel, vv: beforeZoom.vv, open: r.d.probe.sheetOpen, events: r.d.probe.events.slice(-8) }));
  await tapSheet('fill'); await sleep(600);
  r = { d: await mac.debug() };
  const [bl, bt, bw, bh] = r.d.probe.box, [nw, nh] = r.d.probe.natural, k = Math.min(bw / nw, bh / nh);
  const fills = bl + (bw - nw * k) / 2 <= 0.5 && bt + (bh - nh * k) / 2 <= 0.5 && bl + (bw + nw * k) / 2 >= r.d.probe.width - 0.5 && bt + (bh + nh * k) / 2 >= r.d.probe.inner - 0.5;
  check(fills, `Full screen covers the whole screen (${r.d.probe.transform})`);
  await tapSheet('fit'); r = await until(d => !d.probe.transform);
  check(r.ms >= 0, 'Fit to screen');
  sim.tap(200, offset + (await mac.debug()).probe.panel[1] / 2); // The backdrop above the sheet hides them.
  r = await until(d => !d.probe.sheetOpen);
  check(r.ms >= 0, 'tapping outside hides the controls');
  await tapApp('blank'); await until(d => !raised(d.probe));
  await tapApp('later');
  r = await until(d => d.values.active === 'email' && (d.probe.hint || (raised(d.probe) && onSink(d.probe))), 4000);
  await sleep(1000); r.d = await mac.debug();
  const automatic = raised(r.d.probe) && !r.d.probe.hint;
  check(automatic || !!r.d.probe.hint, `app focused a field itself: ${automatic ? 'keyboard rose by itself' : 'Tap to type shown'}`);
  if (r.d.probe.hint) { tapRect(r.d.probe.hint); r = await until(d => raised(d.probe) && onSink(d.probe)); check(r.ms >= 0, 'Tap to type raises it'); }
  sim.text('X');
  r = await until(d => d.values.email.endsWith('X'));
  check(r.ms >= 0, `typed after: ${JSON.stringify(r.d.values.email)}`);
  await tapApp('blank'); await until(d => !raised(d.probe));
  await tapApp('ro'); await sleep(1500);
  check(!raised((await mac.debug()).probe), 'read-only field keeps the keyboard down');
  await tapControls(); await tapSheet('keyboard');
  r = await until(d => raised(d.probe) && onSink(d.probe));
  check(r.ms >= 0, 'Show keyboard in the controls raises it');
  await tapApp('blank');
  r = await until(d => !raised(d.probe) && !onSink(d.probe));
  check(r.ms >= 0, 'a tap outside text fields closes a keyboard opened from the controls');
  return { failures, automatic };
}
