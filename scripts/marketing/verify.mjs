import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { verifyTour } from './verify-tour.mjs';

// Install QA-only packages outside the app, and point NODE_PATH at that node_modules.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const url = process.env.VIBYRA_MARKETING_URL || 'http://127.0.0.1:8128';
const output = process.env.VIBYRA_MARKETING_QA_DIR || '/tmp/vibyra-marketing-qa';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({ reducedMotion: 'reduce' });
const errors = [];
const results = [];
await mkdir(output, { recursive: true });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

async function expectText(locator, text) {
  await locator.waitFor({ state: 'visible' });
  assert.ok((await locator.innerText()).includes(text), `Expected visible text: ${text}`);
}

try {
  for (const [name, width, height] of [
    ['desktop', 1440, 1000], ['wide', 1920, 1080], ['compact-desktop', 1024, 900],
    ['tablet', 768, 1024], ['small-tablet', 600, 960],
    ['mobile', 390, 844], ['small', 320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.plan-card').first().waitFor();
    assert.equal(await page.locator('h1').count(), 1);
    const layout = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
    }));
    assert.ok(layout.scroll <= width, `${name}: horizontal overflow`);
    assert.equal(layout.brokenImages, 0, `${name}: broken images`);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    await page.screenshot({ path: `${output}/${name}-hero.png` });
    if (name === 'desktop' || name === 'mobile') {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      await writeFile(`${output}/${name}-accessibility.json`, JSON.stringify(axe, null, 2));
      assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    }
    results.push({ name, width, ...layout });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expectText(page.locator('#mode-description'), 'Bring your repository');
  await page.keyboard.press('ArrowRight');
  await expectText(page.locator('#mode-description'), 'standalone conversation');
  await page.keyboard.press('Home');
  await expectText(page.locator('#mode-description'), 'Its memory and skills carry');
  await page.getByRole('tab', { name: /See it come to life/ }).click();
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Phone', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.ok((await page.locator('.preview-viewport').boundingBox()).width < 250);
  await page.getByRole('button', { name: 'Desktop', exact: true }).click();
  assert.ok((await page.locator('.preview-viewport').boundingBox()).width > 500);
  await page.locator('#workspace-tab-1').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#workspace-tab-2').getAttribute('aria-selected'), 'true');
  await expectText(page.locator('.review-demo'), 'Your idea. Your code. Your call.');
  await page.locator('#walkthrough').screenshot({ path: `${output}/desktop-review.png` });
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#workspace-tab-0').getAttribute('aria-selected'), 'true');

  await page.getByRole('button', { name: 'I’m a developer', exact: true }).click();
  await expectText(page.locator('.audience-copy'), 'Bring an existing repo');
  await expectText(page.locator('.getting-started-steps'), 'Bring your repository');
  await page.getByRole('button', { name: 'I’m a vibecoder', exact: true }).click();
  await expectText(page.locator('.audience-copy'), 'Describe what you want');
  await expectText(page.locator('.getting-started-steps'), 'Connect an installed coding agent');
  await verifyTour(page, output, AxeBuilder);
  await page.getByRole('tab', { name: 'See what’s possible', exact: true }).click();
  await expectText(page.locator('#phone-demo-panel'), 'Generated app preview');
  await page.keyboard.press('ArrowDown');
  await expectText(page.locator('#phone-demo-panel'), 'A little');
  assert.equal(await page.locator('#phone-tab-2').getAttribute('aria-selected'), 'true');
  await page.locator('#mobile').screenshot({ path: `${output}/phone-explore.png` });
  await page.getByRole('link', { name: 'A note on phone availability' }).click();
  assert.equal(await page.locator('#phone-availability').getAttribute('open'), '');
  await expectText(page.locator('#phone-availability'), 'remote control isn’t included');

  await page.getByRole('button', { name: 'Yearly', exact: true }).click();
  await expectText(page.locator('.plan-card').nth(1), '£18.75');
  await expectText(page.locator('.plan-card').nth(1), '£225 billed yearly');
  assert.equal(await page.getByRole('link', { name: 'Choose Builder' }).getAttribute('href'), '/billing?plan=builder&cycle=annual');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await expectText(page.locator('.plan-card').nth(1), '£20');
  const downloadUrl = new URL(await page.getByRole('link', { name: 'Get Vibyra for free' }).getAttribute('href'), url);
  assert.equal(downloadUrl.pathname, '/downloads');
  assert.equal((await context.request.get(downloadUrl.href)).status(), 200, 'Download destination must respond');

  const anchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(a => a.getAttribute('href')));
  for (const anchor of new Set(anchors)) assert.equal(await page.locator(anchor).count(), 1, `Missing target ${anchor}`);
  for (const path of ['/downloads', '/login', '/signup', '/billing', '/legal/privacy', '/legal/terms']) {
    const response = await context.request.get(`${url}${path}`);
    assert.equal(response.status(), 200, `Broken destination ${path}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Open menu', exact: true }).getAttribute('aria-expanded'), 'false');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'Mobile', exact: true }).click();
  assert.equal(await page.locator('#home-mobile-menu').count(), 0);

  await page.route('**/api/billing/plans', route => route.fulfill({ status: 503, body: '{}' }));
  await page.reload({ waitUntil: 'networkidle' });
  await expectText(page.getByRole('alert'), 'We couldn’t load the current plans');
  assert.equal(await page.locator('.plan-card').count(), 0, 'No invented fallback pricing');
  await page.unroute('**/api/billing/plans');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.locator('.plan-card').first().waitFor();
  assert.equal(await page.locator('.plan-card').count(), 4);
  // Check readable content in the secondary states as well as the first frame.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('tab', { name: /See it come to life/ }).click();
  await page.getByRole('tab', { name: 'See what’s possible', exact: true }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.locator('.faq-item').evaluateAll(items => items.forEach(item => item.open = true));
  const secondaryAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await writeFile(`${output}/secondary-accessibility.json`, JSON.stringify(secondaryAxe, null, 2));
  assert.deepEqual(secondaryAxe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
  assert.deepEqual(errors, []);
  const fonts = await page.evaluate(() => performance.getEntriesByType('resource').filter(item => item.name.includes('/fonts/')).map(item => ({ url: item.name, bytes: item.decodedBodySize })));
  assert.ok(fonts.length > 0 && fonts.every(font => font.url.endsWith('.woff2')), 'Use compressed web fonts');
  const report = { passed: true, viewports: results, interactions: 'Workspace/mode/phone tabs, expanded tour, dialog focus and dismissal, preview sizes, keyboard, audience setup steps, FAQ, annual billing, menus, live download destination, pricing outage and retry', fonts, pageErrors: errors };
  await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
}
