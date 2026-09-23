import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
const output = resolve('../output/notifications');
await mkdir(output, { recursive: true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+)"/g)].map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src', m[1]))};`).join('\n');
const bundle = await build({ stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/startExperienceFixture.tsx'))};`, resolveDir: process.cwd() }, plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }], bundle: true, write: false, outfile: '/tmp/start.js', format: 'iife', jsx: 'automatic', loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' } });
// A local, replayable preview uses sample stores and never opens real projects.
await Promise.all(bundle.outputFiles.map(f => writeFile(`${output}/${f.path.endsWith('.js') ? 'start.js' : 'start.css'}`, f.contents)));
await writeFile(`${output}/preview.html`, '<!doctype html><meta charset="utf-8"><title>Vibyra welcome — sample design preview</title><link rel="stylesheet" href="./start.css"><div id="root"></div><script src="./start.js"></script>');
const server = createServer((req, res) => {
  const file = bundle.outputFiles.find(f => req.url === '/start.js' ? f.path.endsWith('.js') : req.url === '/start.css' ? f.path.endsWith('.css') : false);
  res.setHeader('Content-Type', file ? req.url.endsWith('.js') ? 'application/javascript' : 'text/css' : 'text/html');
  res.end(file?.text ?? '<meta charset="utf-8"><link rel="stylesheet" href="/start.css"><div id="root"></div><script src="/start.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = process.env.VIBYRA_TEST_WEBKIT ? await webkit.launch({ headless: true }) : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark','light']) for (const [width,height] of [[1000,800],[390,560],[390,320]]) {
    const page = await browser.newPage({ viewport:{width,height} });
    const errors=[]; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?notifications&${theme}`);
    await page.getByRole('button', { name:'Notifications, 12 unread', exact:true }).click();
    await page.getByRole('dialog', { name:'Notifications' }).waitFor();
    await page.waitForTimeout(250);
    const panel = await page.locator('.ncenter').boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width && panel.y + panel.height <= height, 'panel fits viewport');
    assert.equal(await page.locator('.ncenter__list').evaluate(el => el.scrollWidth > el.clientWidth), false);
    const rows = await page.locator('.nrow').all();
    for (let i=0;i<rows.length;i++) {
      const box = await rows[i].boundingBox();
      const action = await rows[i].locator('.nrow__action').boundingBox();
      const meta = await rows[i].locator('.nrow__meta').boundingBox();
      assert.ok(action.y >= meta.y + meta.height, 'action has its own line');
      assert.ok(action.x + action.width <= box.x + box.width && action.y + action.height <= box.y + box.height, 'action fits its row');
      if (i) { const previous = await rows[i-1].boundingBox(); assert.ok(box.y >= previous.y + previous.height, 'rows never overlap'); }
    }
    await page.screenshot({path:`${output}/${theme}-${width}-${height}.png`});
    await rows.at(-1).getByRole('button').scrollIntoViewIfNeeded();
    await rows.at(-1).getByRole('button').click();
    assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['notification-action',11]);
    await page.getByRole('button',{name:'Mark all read'}).click();
    assert.equal(await page.locator('.nrow--unread').count(),0);
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(),0);
    await page.getByRole('button',{name:'Notifications',exact:true}).click();
    await page.getByRole('button',{name:'Clear all'}).click();
    assert.equal(await page.locator('.nrow').count(),0);
    assert.deepEqual(errors,[]); await page.close();
  }
  console.log('PASS: notification rows, long text, action routing, scroll-to-last, viewport bounds, read/clear, Escape; both themes and 3 window sizes.');
} finally { await browser.close(); server.close(); }
