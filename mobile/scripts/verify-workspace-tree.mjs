import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const out = '../output/workspace-tree';
await mkdir(out, { recursive: true });
const fixture = await serveFixture('tests/workspaceTreeFixture.tsx');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) for (const [width, height] of [[390,844], [320,568], [844,390]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?theme=${theme}`);
    const project = page.getByRole('button', { name: 'Studio', exact: true });
    await project.click();
    assert.equal(await project.getAttribute('aria-expanded'), 'true');
    const terminal = page.getByRole('button', { name: 'Development server, Terminal, Working', exact: true });
    await terminal.waitFor();
    await page.screenshot({ path: `${out}/phone-${theme}-${width}.png` });
    await project.click();
    assert.equal(await terminal.count(), 0);
    assert.equal(await project.getAttribute('aria-expanded'), 'false');
    await project.click(); await terminal.click();
    assert.equal(await terminal.getAttribute('aria-selected'), 'true');
    const ideas = page.getByRole('button', { name: 'Ideas', exact: true });
    await ideas.click(); await ideas.click();
    assert.equal(await terminal.count(), 1, 'workspace disclosures remain independent');
    assert.equal(await page.getByTestId('navigation-drawer').evaluate(el => el.scrollWidth > el.clientWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS workspace tree: independent disclosure, session selection, both themes, compact and landscape layouts.');
} finally { await browser.close(); fixture.close(); }
