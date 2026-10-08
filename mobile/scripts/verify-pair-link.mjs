import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';

// F-29: a vibyra://pair link from outside the app names a computer; nothing changes until Pair is tapped.
const out = '/tmp/vibyra-pair-link-screenshots'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/pairLinkBrowserFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const link = data => 'vibyra://pair?data=' + Buffer.from(JSON.stringify(data)).toString('base64url');
const current = { version: 1, hostId: 'host1', name: 'Test computer', publicKey: 'ab'.repeat(32), url: 'ws://localhost:4318', invite: 'ab'.repeat(32), expiresAt: '2099-01-01T00:00:00Z' };
const other = { ...current, hostId: 'host2', name: 'Attacker Mac', publicKey: 'cd'.repeat(32) };
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?theme=${theme}`);
    const fixture = name => page.evaluate(n => window.pairFixture[n](), name);
    const dialog = page.getByRole('dialog', { name: 'Pair a computer?' });
    await page.getByText('Test computer', { exact: true }).waitFor();
    const before = { opens: await fixture('opens'), projects: await fixture('projects') };
    assert.equal(before.projects, 1);

    // A link for another computer: the sheet names it, and the phone stays where it is.
    await page.evaluate(data => window.pairFixture.receive(data), link(other));
    await dialog.waitFor();
    await dialog.getByText('Attacker Mac', { exact: true }).waitFor();
    await dialog.getByText('Pairing switches this phone from Test computer to it.', { exact: false }).waitFor();
    assert.equal(await fixture('opens'), before.opens, 'no connection opened before the tap');
    assert.equal(await fixture('saved'), 'host1');
    assert.equal(await fixture('projects'), before.projects, 'the session was not cleared');
    await capture(page, `${out}/${theme}-confirm.png`);

    // Cancel drops it; the connection and session are exactly as they were.
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await fixture('opens'), before.opens);
    assert.equal(await fixture('saved'), 'host1');
    assert.equal(await fixture('status'), 'connected');
    assert.equal(await fixture('projects'), before.projects);

    // The same computer is not a switch: it reconnects with no sheet.
    await page.evaluate(data => window.pairFixture.receive(data), link(current));
    await page.waitForFunction(b => window.pairFixture.opens() === b + 1, before.opens);
    assert.equal(await dialog.count(), 0, 'the computer already paired needs no tap');

    // A hostile name is one short plain line, never markup or direction tricks.
    const hostile = { ...other, name: `<b>Mac</b>‮gpj.exe ${'x'.repeat(90)}` };
    await page.evaluate(data => window.pairFixture.receive(data), link(hostile));
    await dialog.waitFor();
    const shown = await page.getByTestId('pair-link-name').innerText();
    assert.ok(!shown.includes('‮') && shown.length <= 40 && shown.endsWith('…'), `clipped plain name: ${shown}`);
    assert.equal(await dialog.locator('b').count(), 0);
    await page.getByRole('button', { name: 'Close Pair a computer?', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });

    // Pair is the only way through: it then does what the link used to do by itself.
    const opens = await fixture('opens');
    await page.evaluate(data => window.pairFixture.receive(data), link(other));
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.pairFixture.saved() === 'host2' && window.pairFixture.status() === 'connected');
    assert.equal(await fixture('opens'), opens + 1);
    await page.getByText('Attacker Mac', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS pair link: a different computer waits for a tap showing its name (dark and light), Cancel and Close change nothing, the paired computer reconnects at once, hostile names are clipped plain text, Pair switches.');
} finally { await browser.close(); close(); }
