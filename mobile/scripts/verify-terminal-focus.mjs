import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

// The whole WorkspaceApp fixture deliberately never updates selectedSessionId.
// A terminal tap must still route to that exact session instead of project home.
const fixture = await serveFixture('tests/watchOnlyHomeFixture.tsx');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) for (const ai of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?theme=${theme}${ai ? '&ai-terminal=1' : ''}`);
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'Show sessions in Pocket' }).click();
    await page.getByRole('button', { name: ai ? 'Specific AI terminal, Codex, Working' : 'Mac terminal, Terminal, Working' }).click();
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    await page.getByRole('button', { name: 'Switch chat', exact: true }).getByText(ai ? 'Specific AI terminal' : 'Mac terminal', { exact: true }).waitFor();
    assert.equal(await page.getByText('What are we building?', { exact: false }).count(), 0);
    assert.equal(await page.getByText('Jump back in', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS terminal focus: a terminal row opens the exact session with a lost workspace selection.');
} finally { await browser.close(); fixture.close(); }
