import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const base = process.env.VIBYRA_MARKETING_URL || 'http://127.0.0.1:8128';
const output = process.env.VIBYRA_DOWNLOADS_QA_DIR || '/tmp/vibyra-downloads-qa/final';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({ reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
const layouts = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir(output, { recursive: true });

async function audit(name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await writeFile(`${output}/${name}-accessibility.json`, JSON.stringify(result, null, 2));
  assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
}

try {
  // Verify the real local page and live release catalogue before using that
  // same response for reproducible responsive and interaction checks.
  const response = await context.request.get(`${base}/web-api/download-catalog`);
  assert.equal(response.status(), 200);
  const live = await response.json();
  await page.goto(`${base}/downloads`, { waitUntil: 'networkidle' });
  await page.locator('.download-platform').first().waitFor();
  assert.match(await page.title(), /Download Vibyra/);
  await page.route('**/web-api/download-catalog', route => route.fulfill({ json: live }));
  for (const [name, width, height] of [['desktop', 1440, 1100], ['wide', 1920, 1080], ['laptop', 1366, 768], ['compact', 1024, 900], ['tablet', 768, 1024], ['small-tablet', 600, 960], ['mobile', 390, 844], ['small', 320, 740]]) {
    await page.setViewportSize({ width, height });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.download-platform').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, brokenImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).length }));
    assert.equal(await page.locator('h1').count(), 1);
    assert.ok(state.scroll <= width, `${name} has horizontal overflow`);
    assert.equal(state.brokenImages, 0);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    await page.screenshot({ path: `${output}/${name}-hero.png` });
    if (name === 'desktop' || name === 'mobile') await audit(name);
    layouts.push({ name, ...state });
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  const windows = page.locator('.download-platform').filter({ has: page.locator('#platform-windows') });
  const linux = page.locator('.download-platform').filter({ has: page.locator('#platform-linux') });
  await windows.getByRole('link', { name: 'Getting set up' }).click();
  assert.equal(await page.getByRole('tab', { name: 'Windows', exact: true }).getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('#setup-panel').innerText(), /Open the installer/);
  await linux.getByRole('link', { name: 'Getting set up' }).click();
  assert.equal(await page.getByRole('tab', { name: 'Linux', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByRole('button', { name: 'AppImage', exact: true }).click();
  assert.match(await page.locator('.download-command code').innerText(), /chmod \+x/);
  await page.getByRole('button', { name: 'Copy installation command' }).click();
  await page.getByRole('status').filter({ hasText: 'Installation command copied.' }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator('.download-command code').innerText());
  await page.getByRole('button', { name: '.deb', exact: true }).click();
  assert.match(await page.locator('.download-command code').innerText(), /sudo apt install/);
  assert.match(await page.locator('.download-command code').innerText(), new RegExp(live.releases.find(item => item.platform === 'linux-deb').filename.replaceAll('.', '\\.')));
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }));
  await page.getByRole('button', { name: 'Copy installation command' }).click();
  await page.getByRole('status').filter({ hasText: 'Copy unavailable.' }).waitFor();
  await page.getByRole('tab', { name: 'Linux', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#setup-panel').innerText(), /A little more time for Mac/);
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('tab', { name: 'Windows', exact: true }).getAttribute('aria-selected'), 'true');

  for (const link of await page.locator('.download-package a').all()) {
    const href = await link.getAttribute('href');
    const destination = new URL(href, base);
    assert.ok(['/downloads/windows', '/downloads/linux', '/downloads/linux-deb'].includes(destination.pathname));
    const head = await context.request.head(destination.href);
    assert.equal(head.status(), 200);
    assert.match(head.headers()['content-disposition'], /attachment/i);
    assert.match(head.headers()['x-checksum-sha256'], /^[a-f0-9]{64}$/i);
  }
  await page.locator('.faq-item').evaluateAll(items => items.forEach(item => item.open = true));
  await audit('expanded');
  for (const anchor of new Set(await page.locator('a[href^="#"]').evaluateAll(links => links.map(a => a.getAttribute('href'))))) {
    assert.equal(await page.locator(anchor).count(), 1, `Missing anchor ${anchor}`);
  }
  assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Desktop', exact: true }).getAttribute('href'), '/#desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Mobile', exact: true }).getAttribute('href'), '/#mobile');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#home-mobile-menu').count(), 0);
  await page.goto(`${base}/account/downloads`, { waitUntil: 'networkidle' });
  await page.locator('.download-platform').first().waitFor();
  assert.equal(await page.locator('.downloads-page').count(), 1);

  await page.unroute('**/web-api/download-catalog');
  await page.route('**/web-api/download-catalog', route => route.fulfill({ status: 503, json: { ok: false } }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.download-package a').count(), 0);
  await page.unroute('**/web-api/download-catalog');
  await page.route('**/web-api/download-catalog', route => route.fulfill({ json: live }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('.download-platform').first().waitFor();
  assert.equal(await page.locator('.download-package a').count(), 3);

  const macFixture = structuredClone(live);
  const variants = macFixture.releases.find(item => item.platform === 'macos').variants;
  Object.assign(variants[0], { available: true, version: '1.2.3', filename: 'Vibyra-arm64.dmg', sizeBytes: 1024, sha256: 'a'.repeat(64) });
  await page.unroute('**/web-api/download-catalog');
  await page.route('**/web-api/download-catalog', route => route.fulfill({ json: macFixture }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Apple Silicon', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Intel', exact: true }).count(), 0);
  await page.getByRole('tab', { name: 'macOS', exact: true }).click();
  assert.match(await page.locator('#setup-panel').innerText(), /Open the disk image/);
  const unavailable = structuredClone(live);
  unavailable.releases.forEach(item => { item.available = false; item.variants?.forEach(variant => variant.available = false); });
  await page.unroute('**/web-api/download-catalog');
  await page.route('**/web-api/download-catalog', route => route.fulfill({ json: unavailable }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.download-platform').first().waitFor();
  assert.equal(await page.locator('.download-package a').count(), 0);
  assert.equal(await page.locator('.download-recommended').count(), 0);
  assert.equal(await page.locator('.download-release-label').innerText(), 'Desktop beta');
  assert.deepEqual(errors, []);
  const report = { passed: true, layouts, pageErrors: errors, checks: 'Live catalogue and attachment headers, package availability, matching setup guides, keyboard tabs, actual filenames, clipboard success/failure, FAQ, cross-page navigation, alias, outage/retry and Mac architecture fixtures' };
  await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); await browser.close(); }
