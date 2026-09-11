import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// The catalogue is a menu, so it has to be readable on every runtime. This drives
// the computer home with `cloud` false - the browser, Android and sample-workspace
// case - and fails if the picker ever collapses back to Auto alone.
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-work-picker'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/workScreenFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const [cloud, theme] of [['0', 'dark'], ['1', 'dark'], ['0', 'light']]) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?cloud=${cloud}&theme=${theme}`);
    await page.getByRole('heading', { name: 'What are we building?' }).waitFor();
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose your AI' });
    await picker.getByRole('radio', { name: 'Auto', exact: true }).waitFor();
    const companies = await picker.locator('[aria-expanded]').evaluateAll(
      nodes => nodes.map(node => node.getAttribute('aria-label')));
    // The regression: the catalogue used to be gated on the runtime, so this list
    // was empty and Auto was the only thing anyone could pick.
    assert.ok(companies.length >= 5,
      `cloud=${cloud}: every runtime reads the catalogue, saw ${companies.length} companies`);
    for (const company of ['OpenAI', 'Anthropic', 'Google', 'xAI'])
      assert.ok(companies.includes(company), `cloud=${cloud}: ${company} is missing from the picker`);
    await capture(page, `${out}/work-picker-${theme}-cloud-${cloud}.png`);
    await page.getByRole('button', { name: 'Anthropic', exact: true }).click();
    const rows = await picker.getByRole('radio').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    assert.ok(rows.length > 1, `cloud=${cloud}: opening a company reveals its models, saw ${rows}`);
    assert.ok(rows.some(name => /Opus|Sonnet|Haiku/.test(name)), `cloud=${cloud}: Anthropic models are listed, saw ${rows}`);
    await capture(page, `${out}/work-picker-open-${theme}-cloud-${cloud}.png`);
    // A model a free account cannot spend its trial credit on is locked: tapping it
    // says what would unlock it rather than selecting something that would be
    // refused at send time. Sonnet 5 is $10/M out, well past the free ceiling.
    await picker.getByRole('radio', { name: /Sonnet 5, membership needed/ }).click();
    await picker.getByText('Included with a membership', { exact: true }).waitFor();
    await capture(page, `${out}/work-picker-locked-${theme}-cloud-${cloud}.png`);
    // The notice is a route, not a dead end: it leads to the plans.
    await picker.getByRole('button', { name: 'See plans', exact: true }).click();
    assert.equal(await page.evaluate(() => window.walletOpened), true, 'See plans opens the plans');
    await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
    // No price sits beside a model any more; the lock is the whole message.
    assert.equal(await picker.getByText('Paid Vibes', { exact: true }).count(), 0,
      'A locked model is shown as locked, not priced');

    // An included model still selects, and choosing it is never silently dropped.
    await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
    const free = picker.getByRole('radio', { name: /GPT-5\.6 Luna/ });
    assert.ok(!/membership/.test(await free.getAttribute('aria-label') ?? ''),
      'An inexpensive model is included rather than locked');
    await free.click();
    if (cloud === '0') await page.getByText(/saved for your next AI chat/).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme} cloud=${cloud}: ${companies.length} companies, locks shown, included model selectable.`);
  }
} finally { await browser?.close(); close(); }
