import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const output = '/tmp/vibyra-report-ui';
await mkdir(output, { recursive: true });
const server = await serveFixture('tests/settingsFixture.tsx');
const agentServer = await serveFixture('tests/agentsBrowserFixture.tsx');
try {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch(engineName === 'chromium'
      ? { executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }
      : { headless: true });
    try {
      for (const theme of ['dark', 'light']) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${server.url}/?state=signedin&theme=${theme}&drawer=1`);
        const reportEntry = page.getByRole('button', { name: 'Report a problem' });
        const entry = await reportEntry.boundingBox();
        const settingsEntry = await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox();
        assert.ok(entry && settingsEntry && entry.height >= 44 && entry.y > 500
          && entry.x < settingsEntry.x && Math.abs(entry.y - settingsEntry.y) < 2,
        'Report and Settings share one bottom row with full tap targets');
        await page.screenshot({ path: `${output}/${engineName}-${theme}-drawer.png` });
        await reportEntry.click();
        await page.getByRole('textbox', { name: 'Summary' }).waitFor();
        await page.waitForTimeout(350);
        assert.ok(await page.getByText('ellis@example.com').last().isVisible());
        assert.ok(await page.getByRole('button', { name: 'Add screenshot' }).isVisible());
        assert.equal(await page.getByRole('button', { name: 'Send report' }).isDisabled(), true);
        await page.screenshot({ path: `${output}/${engineName}-${theme}.png` });
        const disclosure = page.getByText(/Includes app version, screen, request IP/);
        await disclosure.scrollIntoViewIfNeeded();
        const note = await disclosure.boundingBox();
        const action = await page.getByRole('button', { name: 'Send report' }).boundingBox();
        assert.ok(note && action && note.y + note.height <= action.y, 'included details remain readable above Send');
        await page.getByRole('textbox', { name: 'Summary' }).fill('Blank preview');
        await page.getByRole('textbox', { name: 'Details' }).fill('The preview opens to a blank screen.');
        assert.equal(await page.getByRole('button', { name: 'Send report' }).isEnabled(), true);
        await page.getByRole('button', { name: 'Send report' }).click();
        await page.getByText('Report sent').waitFor();
        const reports = await page.evaluate(() => window.reportSubmissions);
        assert.equal(reports.length, 1);
        assert.equal(reports[0].summary, 'Blank preview');
        assert.deepEqual(errors, []);
        await page.close();
      }
      const compact = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
      await compact.goto(`${server.url}/?state=signedin&drawer=1`);
      await compact.getByRole('button', { name: 'Report a problem' }).click();
      await compact.getByRole('textbox', { name: 'Summary' }).waitFor();
      await compact.waitForTimeout(350);
      assert.ok(await compact.getByRole('button', { name: 'Send report' }).isVisible());
      await compact.screenshot({ path: `${output}/${engineName}-compact.png` });
      await compact.close();
      const guest = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
      await guest.goto(`${server.url}/?state=signedout&drawer=1`);
      await guest.getByRole('button', { name: 'Report a problem' }).click();
      await guest.getByText('Sign in to report').waitFor();
      await guest.waitForTimeout(350);
      await guest.screenshot({ path: `${output}/${engineName}-guest.png` });
      await guest.close();
      const agent = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await agent.goto(agentServer.url);
      await agent.getByRole('tab', { name: 'Agents', exact: true }).click();
      await agent.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
      await agent.getByRole('button', { name: 'Report a problem' }).waitFor();
      await agent.waitForTimeout(350);
      const agentReport = await agent.getByRole('button', { name: 'Report a problem' }).boundingBox();
      const agentSettings = await agent.getByRole('button', { name: 'Settings', exact: true }).boundingBox();
      assert.ok(agentReport && agentSettings && agentReport.height >= 44
        && agentReport.x < agentSettings.x && Math.abs(agentReport.y - agentSettings.y) < 2);
      await agent.screenshot({ path: `${output}/${engineName}-agents-drawer.png` });
      await agent.getByRole('button', { name: 'Report a problem' }).click();
      await agent.getByTestId('settings-sheet').waitFor();
      await agent.close();
    } finally { await browser.close(); }
  }
} finally { server.close(); agentServer.close(); }
console.log(`Report page verified in Chromium and WebKit. Screenshots in ${output}`);
