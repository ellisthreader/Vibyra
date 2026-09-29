import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Launch tests/nativePhoneKeyboardFixture.tsx on an isolated QA simulator first.
// IDB_BIN must point at an installed idb executable; never defaults to a live phone.
const udid = process.env.QA_UDID;
const idb = process.env.IDB_BIN;
assert.ok(udid && idb, 'Set QA_UDID and IDB_BIN explicitly.');
const devices = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '--json'])).devices;
const device = Object.values(devices).flat().find(d => d.udid === udid);
assert.ok(device?.state === 'Booted' && /QA/.test(device.name), 'Use a booted isolated QA simulator.');
const ui = (...args) => execFileSync(idb, ['ui', ...args, '--udid', udid], { encoding: 'utf8' });
const state = () => JSON.parse(ui('describe-all'));
async function until(predicate, label) {
  const deadline = Date.now() + 10_000;
  do { const result = predicate(state()); if (result) return result; await delay(150); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}
async function tap(label) {
  const item = await until(items => items.find(x => x.AXLabel === label), label);
  const f = item.frame;
  ui('tap', String(Math.round(f.x + f.width / 2)), String(Math.round(f.y + f.height / 2)));
  // Accessibility exposes sheet content before UIKit finishes its transition.
  await delay(700);
}
const value = items => items.find(x => x.AXLabel?.startsWith('Confirmed Mac value: '))?.AXLabel.slice('Confirmed Mac value: '.length);
const fieldValue = items => items.find(x => x.AXLabel === 'Mac text field')?.AXValue;
const gear = state().find(x => x.AXLabel === 'gearshape.fill');
if (gear && gear.frame.y < 200) {
  ui('swipe', String(Math.round(gear.frame.x + 13)), String(Math.round(gear.frame.y + 13)), '40', '490', '--duration', '1');
}
for (const theme of ['dark', 'light']) {
  const before = await until(value, 'fixture Mac value');
  await tap('Type on your Mac');
  if (state().some(x => x.AXLabel === 'Load current Mac field')) await tap('Load current Mac field');
  await until(items => items.some(x => x.AXLabel === 'return'), 'Apple software keyboard');
  for (const key of [' ', 'h', 'i', 'delete', 'i', 'return']) await tap(key);
  const expected = `${before} hi\n`;
  await until(items => fieldValue(items) === expected && items.some(x => x.AXLabel === 'Up to date on Mac'), 'applied native edit');
  execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', `/tmp/vibyra-phone-keyboard-native-${theme}.png`]);
  await tap('Close Type on your Mac');
  await until(items => value(items) === expected, 'actual simulated Mac value after dismissal');
  await tap('Mac takes over');
  await tap('Type on your Mac');
  await until(items => fieldValue(items) === expected && items.some(x => x.AXLabel === 'Paused'), 'retained phone copy');
  await tap('Load current Mac field');
  await until(items => fieldValue(items) === 'Edited on Mac' && items.some(x => x.AXLabel === 'return'), 'explicit reload and keyboard focus');
  await tap('Close Type on your Mac');
  await until(items => value(items) === 'Edited on Mac', 'Mac local edit preserved');
  if (theme === 'dark') await tap('Switch theme');
}
await tap('Revoke phone typing');
assert.ok(!state().some(x => x.AXLabel === 'Type on your Mac'));
console.log('PASS Apple key taps, delete/newline, applied fixture Mac value, dismissal, recovery, explicit reload and permission removal in both themes.');
console.log('Simulated Mac fixture; does not establish physical LAN/Cloud or signed Mac WebKit acceptance.');
