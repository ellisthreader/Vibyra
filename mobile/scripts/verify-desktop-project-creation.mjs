import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
const useWebKit = process.env.VIBYRA_TEST_WEBKIT === '1';
const out = resolve(`../output/project-creation${useWebKit ? '-webkit' : ''}`); await mkdir(out, { recursive: true });
const bundle = await build({ entryPoints: ['../desktop-tauri/tests/projectCreationFixture.tsx'], bundle: true, write: false,
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
    const page = await browser.newPage({ viewport: { width: 960, height: 700 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}`);
    const slider = page.getByRole('slider', { name: 'Effort' });
    await slider.focus(); await slider.press('End'); assert.equal(await slider.getAttribute('aria-valuetext'), 'Ultra');
    await slider.press('Home'); assert.equal(await slider.getAttribute('aria-valuetext'), 'Low');
    for (let i = 0; i < 5; i++) await slider.press('ArrowRight');
    assert.equal(await slider.getAttribute('aria-valuetext'), 'Ultra');
    for (const width of [960, 720]) {
      await page.setViewportSize({ width, height: 700 });
      assert(await page.locator('.launch-effort').evaluate(el => {
        const box = el.getBoundingClientRect(); const track = el.querySelector('input').getBoundingClientRect();
        const heading = el.querySelector('.launch-effort__heading').getBoundingClientRect();
        return track.left >= box.left && track.right <= box.right && heading.bottom <= track.top && el.scrollWidth <= el.clientWidth;
      }));
      await page.screenshot({ path: `${out}/effort-${theme}-${width}.png` });
    }
    await page.locator('.chrome').getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('heading', { name: 'New project', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Create project', exact: true }).isDisabled());
    await page.getByLabel('Project name').fill('../escape');
    assert(await page.getByRole('button', { name: 'Create project', exact: true }).isDisabled());
    await page.getByLabel('Project name').fill('My next project');
    await page.getByLabel('Location', { exact: true }).click();
    await page.screenshot({ path: `${out}/new-project-${theme}.png` });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.getByTestId('active-project').textContent(), 'original');
    await page.locator('.workspace-tree__heading').getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name').fill('Created project');
    await page.evaluate(() => window.failNextSave());
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.getByRole('button', { name: 'Retry opening project', exact: true }).click();
    await page.getByTestId('active-project').waitFor();
    assert.notEqual(await page.getByTestId('active-project').textContent(), 'original');
    const creates = await page.evaluate(() => window.requests.filter(r => r.command === 'fs_create_project_folder'));
    assert.equal(creates.length, 1); assert.deepEqual(creates[0].args, { parent: '/Users/fixture', name: 'Created project' });
    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}&models`);
    assert.equal(await page.locator('.launch-effort__stops i').count(), 6);
    await page.getByRole('button', { name: /More models/ }).click();
    const list = page.getByRole('listbox', { name: 'All models' });
    await list.hover(); await page.mouse.wheel(0, 1600);
    await page.waitForFunction(() => document.querySelector('.launch-model-browser__list').scrollTop > 100);
    assert(await list.evaluate(el => el.scrollHeight > el.clientHeight));
    await page.getByRole('option', { name: 'Model 36', exact: true }).click();
    assert.equal(await list.count(), 0);
    await page.getByRole('button', { name: /More models/ }).click();
    await page.getByRole('textbox', { name: 'Search models' }).fill('Model 20');
    assert.equal(await page.getByRole('option').count(), 1);
    await page.getByRole('textbox', { name: 'Search models' }).press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await list.count(), 0);
    await page.getByRole('button', { name: /More models/ }).click();
    await page.screenshot({ path: `${out}/models-${theme}.png` });
    await page.keyboard.press('Escape'); assert.equal(await list.count(), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS: effort keyboard stops, compact layout, both themes, project entry points, cancellation, save retry, model wheel scrolling, search and selection.');
} finally { await browser.close(); server.close(); }
