import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { chromePath } from './chrome-path.mjs';

const desktop = await serveFixture('../desktop-tauri/tests/phoneKeyboardFixture.tsx', {
  react: resolve('../desktop-tauri/node_modules/react'), 'react-dom': resolve('../desktop-tauri/node_modules/react-dom'),
});
const phone = await serveFixture('tests/phoneKeyboardBrowserFixture.tsx');
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
try {
  const mac = await browser.newPage();
  const errors = []; mac.on('pageerror', e => errors.push(e.message));
  await mac.goto(desktop.url);
  const rpc = (method, params) => mac.evaluate(async ({ method, params }) => window.keyboardRpc(method, params), { method, params });
  await mac.getByRole('textbox', { name: 'First terminal', exact: true }).click();
  let { result: snapshot } = await rpc('snapshot');
  const { result: claim } = await rpc('claim', { targetId: snapshot.target.id, revision: snapshot.target.revision });
  const text = 'Hello 👩🏽‍💻\n你好 café';
  const edit = { targetId: claim.target.id, lease: claim.lease, revision: claim.target.revision, editId: 'one', text, selection: { start: 5, end: 5 } };
  const first = await rpc('edit', edit);
  assert.equal(first.result.target.text, text);
  assert.equal(await mac.getByRole('textbox', { name: 'First terminal', exact: true }).inputValue(), text);
  assert.equal(await mac.getByRole('textbox', { name: 'First terminal', exact: true }).evaluate(el => el.selectionStart), 5);
  assert.equal((await rpc('edit', edit)).result.target.revision, first.result.target.revision);
  await mac.getByRole('textbox', { name: 'Second terminal', exact: true }).click();
  assert.match((await rpc('edit', edit)).error, /changed/);
  assert.equal(await mac.getByRole('textbox', { name: 'Second terminal', exact: true }).inputValue(), '');
  await mac.getByRole('textbox', { name: 'First terminal', exact: true }).click();
  assert.match((await rpc('edit', edit)).error, /changed/);
  await mac.getByLabel('Password', { exact: true }).click();
  assert.equal((await rpc('snapshot')).result.target, null);
  await mac.getByRole('textbox', { name: 'First terminal', exact: true }).click();
  await mac.evaluate(() => window.revokeKeyboard());
  assert.match((await rpc('snapshot')).error, /revoked/);
  assert.deepEqual(errors, []);
  await mac.close();
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(phone.url);
    if (theme === 'light') await page.getByRole('button', { name: 'Switch theme' }).click();
    await page.getByRole('button', { name: 'Type on your Mac' }).click();
    const input = page.getByRole('textbox', { name: 'Mac text field' });
    await input.fill(text);
    await page.getByText('Up to date on Mac', { exact: true }).waitFor();
    assert.equal(await page.getByTestId('confirmed-mac-value').textContent(), text);
    await page.screenshot({ path: `/tmp/vibyra-phone-keyboard-${theme}.png` });
    await page.getByRole('button', { name: 'Close Type on your Mac' }).click();
    await page.getByRole('button', { name: 'Toggle connection' }).click();
    assert.equal(await page.getByRole('button', { name: 'Type on your Mac' }).count(), 0);
    await page.getByRole('button', { name: 'Toggle connection' }).click();
    await page.getByRole('button', { name: 'Mac takes over' }).click();
    await page.getByRole('button', { name: 'Type on your Mac' }).click();
    assert.equal(await input.inputValue(), text, 'Closed phone copy remains available');
    await page.getByRole('button', { name: 'Load current Mac field' }).click();
    await page.getByText('Up to date on Mac', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), 'Edited on Mac');
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS real React field edits/cursor/dedupe/focus/password/revocation and phone draft recovery in both themes.');
} finally { await browser.close(); desktop.close(); phone.close(); }
