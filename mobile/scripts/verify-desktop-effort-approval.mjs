import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
const useWebKit = process.env.VIBYRA_TEST_WEBKIT === '1';
const out = resolve(`../output/effort-approval${useWebKit ? '-webkit' : ''}`); await mkdir(out, { recursive: true });
const bundle = await build({ entryPoints: ['../desktop-tauri/tests/effortApprovalFixture.tsx'], bundle: true, write: false,
  plugins: [{ name: 'fixture-art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  outfile: '/tmp/project-fixture.js', format: 'iife', jsx: 'automatic', loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' } });
const server = createServer((req, res) => {
  const file = bundle.outputFiles.find(f => req.url === '/fixture.js' ? f.path.endsWith('.js') : req.url === '/fixture.css' ? f.path.endsWith('.css') : false);
  res.setHeader('Content-Type', file ? req.url.endsWith('.js') ? 'application/javascript' : 'text/css' : 'text/html');
  res.end(file?.text ?? '<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = useWebKit ? await webkit.launch({ headless: true }) : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 700 }, recordVideo: { dir: out, size: { width: 960, height: 700 } } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const provider of ['codex', 'claude']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}&${provider}`);
      const effort = page.getByRole('slider', { name: 'Effort' });
      await effort.focus(); await effort.press('End');
      const row = page.locator('.launch-effort');
      assert.equal(await row.getAttribute('data-effort'), provider === 'claude' ? 'ultracode' : 'ultra');
      const canvas = page.locator('.launch-effort-animation');
      await page.waitForTimeout(200);
      const before = await canvas.evaluate(el => el.toDataURL());
      await page.waitForTimeout(200);
      assert.notEqual(await canvas.evaluate(el => el.toDataURL()), before, 'actual rendered animation pixels change');
      const bounds = await canvas.boundingBox(); const picker = await row.boundingBox();
      assert.equal(bounds.width, picker.width); assert.equal(bounds.height, picker.height);
      assert.equal(await page.locator('.launch-particles').count(), 0);
      await effort.blur(); await page.screenshot({ path: `${out}/effort-${provider}-${theme}.png` });
      await page.waitForTimeout(1400);
      if (provider === 'codex') assert(await canvas.evaluate(el => !el.getContext('2d').getImageData(0,0,el.width,el.height).data.some((v,i) => i % 4 === 3 && v > 0)), 'Codex ignition is one-shot');
      else assert.equal(await canvas.getAttribute('data-effect'), 'violet-ripple');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('.launch-effort').dataset.motion === 'still', null, {timeout: 3000});
      const stopped = await canvas.getAttribute('data-frame');
      await page.waitForTimeout(160);
      assert.equal(await canvas.getAttribute('data-frame'), stopped);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => document.documentElement.dataset.performance = 'best');
      await page.waitForFunction(() => document.querySelector('.launch-effort').dataset.motion === 'still', null, {timeout: 3000});
      await page.evaluate(() => delete document.documentElement.dataset.performance);
      const rowBefore = await row.boundingBox();
      await page.getByRole('button', { name: /More models/ }).click();
      assert.deepEqual(await row.boundingBox(), rowBefore, 'opening the floating list must not move controls');
      const list = page.getByRole('listbox', { name: 'All models' });
      await list.hover(); await page.mouse.wheel(0, 1400);
      await page.waitForFunction(() => document.querySelector('.launch-model-browser__list').scrollTop > 100);
      await page.getByRole('option', { name: 'Model 32', exact: true }).click();
      assert.equal(await list.count(), 0);
      await page.getByRole('button', { name: /More models/ }).click();
      await page.setViewportSize({ width: 720, height: 480 });
      await page.waitForFunction(() => { const b = document.querySelector('.launch-model-browser').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth; });
      await page.getByRole('textbox', { name: 'Search models' }).fill('Model 30');
      assert.equal(await page.getByRole('option').count(), 1);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 960, height: 700 });
      await effort.focus(); await effort.press('ArrowLeft');
      await page.waitForTimeout(220);
      if (provider === 'claude') {
        assert.equal(await canvas.getAttribute('data-effect'), 'rainbow-label');
        const colors = await row.locator('output span').evaluateAll(els => els.map(el => el.style.color).join(','));
        await page.waitForTimeout(220);
        assert.notEqual(await row.locator('output span').evaluateAll(els => els.map(el => el.style.color).join(',')), colors);
      }
      await effort.press('Home');
      assert.equal(await row.getAttribute('data-motion'), null);

    }
    await page.evaluate(() => window.openApproval(3));
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await page.screenshot({ path: `${out}/checkpoint-${theme}.png` });
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
    assert.equal(await page.evaluate(() => window.launchCount()), 0);
    await page.evaluate(() => window.openApproval(3));
    await page.getByRole('button', { name: 'Save & start 3 workers', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Preparing…', exact: true }).isDisabled());
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 1);
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.launchCount()), 1);
    await page.evaluate(() => window.openApproval(1, true));
    await page.getByRole('button', { name: 'Save & start worker', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert(await page.getByRole('button', { name: 'Save & start worker', exact: true }).isEnabled());
    await page.setViewportSize({ width: 420, height: 480 });
    assert(await dialog.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; }));
    await page.screenshot({ path: `${out}/checkpoint-compact-${theme}.png` });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(errors, []); const video = page.video(); await page.close(); await copyFile(await video.path(), `${out}/cli-effort-${theme}.webm`);
  }
  console.log('PASS: CLI picker ripple/ignition/rainbow, floating scrollable model picker, Reduce Motion, quiet lower effort, checkpoint layout, cancel, busy lock and failure recovery.');
} finally { await browser.close(); server.close(); }
