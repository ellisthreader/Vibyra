import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const server = await serveFixture('tests/notificationsBrowserFixture.tsx');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
await mkdir('/tmp/vibyra-notifications', { recursive: true });
try {
  for (const theme of ['dark','light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors=[]; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.url}/?state=signedin&theme=${theme}`);
    const smart=page.getByRole('switch', {name:'Use Jev for task decisions',exact:true});
    await smart.scrollIntoViewIfNeeded();await smart.click();
    await smart.evaluate(e => { if (!e.checked && e.getAttribute('aria-checked') !== 'true') throw new Error('Smart consent was not saved'); });
    const advisory=page.getByRole('switch',{name:'Progress advisories',exact:true});await advisory.scrollIntoViewIfNeeded();await advisory.click();
    const quiet=page.getByRole('switch',{name:'Quiet overnight',exact:true});await quiet.click();
    await page.waitForFunction(e => e.checked, await quiet.elementHandle());
    await page.waitForTimeout(300);
    await page.screenshot({path:`/tmp/vibyra-notifications/${theme}-settings.png`});
    const updates=page.getByRole('button',{name:/^Updates/});await updates.scrollIntoViewIfNeeded();await updates.click();
    await page.getByText('Your task may need a review',{exact:true}).waitFor();
    await page.waitForTimeout(300);await page.screenshot({path:`/tmp/vibyra-notifications/${theme}-updates.png`});
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Notification settings and Updates passed in both themes at 375 × 667.');
} finally { await browser.close(); await server.close(); }
