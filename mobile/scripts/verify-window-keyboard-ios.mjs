// Proves the phone keyboard for a computer app's window Preview on an iOS
// Simulator: a tap on a text field raises the right keyboard in the same tap,
// typing (autocorrect and QuickType included) reaches the app exactly, and
// Return, delete, the key bar and the Tap-to-type fallback work.
//
//   VIBYRA_KEYBOARD_SIMULATOR=<booted spare simulator> node scripts/verify-window-keyboard-ios.mjs
//   VIBYRA_KEYBOARD_TARGET=safari (default): Safari keeps iOS's tap rule, as a
//     phone app from before the keyboard change does.
//   VIBYRA_KEYBOARD_TARGET=native: the dev build's real PreviewWebView through
//     tests/windowKeyboardNativeFixture.tsx and Metro (VIBYRA_METRO).
// Needs idb (IDB=path) and the Simulator's software keyboard (hardware
// keyboard disconnected). The stand-in computer is window-keyboard-fake-mac.mjs.
import assert from 'node:assert/strict';
import { startFakeMac } from './window-keyboard-fake-mac.mjs';
import { dismissDevMenu, openNativeFixture, simulator } from './window-keyboard-sim.mjs';
import { runSteps } from './window-keyboard-steps.mjs';

const device = process.env.VIBYRA_KEYBOARD_SIMULATOR;
const reserved = '258E794C-4AA5-4FA8-AE7D-8ACB070786D5';
assert.ok(device && device !== reserved, 'Set VIBYRA_KEYBOARD_SIMULATOR to a separate booted simulator UUID.');
const target = process.env.VIBYRA_KEYBOARD_TARGET ?? 'safari';
const sim = simulator(device);
const mac = await startFakeMac(47900);
try {
  // A viewer left open in either app would also poll the stand-in computer.
  sim.terminate('com.apple.mobilesafari');
  sim.terminate('app.vibyra.mobile');
  if (target === 'native') {
    await openNativeFixture(sim);
    await dismissDevMenu(sim);
  } else {
    sim.openUrl(`http://127.0.0.1:47900/?opened=${Date.now()}`);
  }
  // Where the page starts on screen: under Safari's status area, or under the
  // Preview address strip in the app. Calibrated by a tap before the checks.
  const { failures, automatic } = await runSteps({ sim, mac, top: target === 'native' ? 120 : 62 });
  if (target === 'native') assert.ok(automatic, 'the Vibyra app raises the keyboard when the app focuses a field itself');
  assert.equal(failures, 0, `${failures} checks failed`);
  console.log(`PASS window keyboard on iOS (${target})`);
} finally {
  sim.terminate(target === 'native' ? 'app.vibyra.mobile' : 'com.apple.mobilesafari');
  await mac.close();
}
