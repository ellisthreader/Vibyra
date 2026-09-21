import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
const output = resolve('../output/desktop-start');
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
  for (const theme of ['dark', 'light']) for (const screen of ['home', 'empty', 'auth']) {
    const page = await browser.newPage({ viewport: { width: 1328, height: 900 } });
    page.setDefaultTimeout(7000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?${theme}&${screen}`);
    await page.locator('.start-sculpture').waitFor();
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${output}/${screen}-${theme}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (screen !== 'auth') assert.match(await page.locator('h1').last().innerText(), /Barbara/);
    assert.equal(await page.locator('.start-sculpture__logo').evaluate(el => el.complete && el.naturalWidth > 0), true);
    if (screen === 'auth') {
      await page.getByRole('button', { name: /Continue with email/i }).click();
      await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('test@example.test');
      await page.setViewportSize({ width: 600, height: 560 });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Log in', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/auth-email-${theme}-compact.png` });
      assert.ok(await page.getByRole('textbox', { name: 'Email address', exact: true }).isVisible());
    } else {
      await page.getByRole('main').getByRole('button', { name: 'Open a folder', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['open-folder']);
      if (screen === 'home') {
        await page.getByRole('button', { name: /Give the homepage a fresh start/ }).click();
        assert.deepEqual(await page.evaluate(() => window.startEvents.slice(-2)), [['activate', 'studio'], ['focus', 1]]);
      }
      await page.getByRole('main').getByRole('button', { name: 'New project', exact: true }).click();
      assert.equal(await page.evaluate(() => window.startView()), 'new-project');
      await page.setViewportSize({ width: 960, height: 640 });
      await page.screenshot({ path: `${output}/${screen}-${theme}-compact.png` });
      assert.equal(await page.locator('.homeview').evaluate(el => el.scrollWidth > el.clientWidth), false);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.start-sculpture__shape').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator(screen === 'auth' ? '.auth-card' : '.homeview__hi').evaluate(el => getComputedStyle(el).opacity), '1');
    assert.deepEqual(errors, []); await page.close();
  }
  for (const name of ['Alexandra-Catherine', '']) {
    const personal = await browser.newPage({ viewport: { width: 960, height: 640 }, reducedMotion: 'reduce' });
    await personal.goto(`${url}/?empty&name=${encodeURIComponent(name)}`);
    assert.match(await personal.locator('.homeview h1').innerText(), new RegExp(name || 'Welcome to\\s+Vibyra'));
    assert.equal(await personal.locator('.homeview').evaluate(el => el.scrollWidth > el.clientWidth), false);
    await personal.close();
  }
  const motion = await browser.newPage({ viewport: { width: 1328, height: 900 } });
  await motion.goto(`${url}/?empty`);
  const sculpture = motion.locator('.start-sculpture');
  await sculpture.waitFor();
  const early = await sculpture.screenshot();
  await motion.waitForTimeout(2600);
  const settled = await sculpture.screenshot();
  assert.notDeepEqual(early, settled, 'arrival changes rendered pixels');
  await motion.waitForTimeout(300);
  assert.deepEqual(settled, await sculpture.screenshot(), 'decoration settles with no idle motion');
  await motion.getByRole('main').getByRole('button', { name: 'New project', exact: true }).focus();
  await motion.keyboard.press('Enter');
  assert.equal(await motion.evaluate(() => window.startView()), 'new-project');
  await motion.close();
  const page = await browser.newPage(); await page.goto(`${url}/?performance&empty`); await page.waitForTimeout(100);
  assert.equal(await page.locator('.homeview__hi').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.ok(await page.locator('.start-sculpture__shape').evaluate(el => parseFloat(getComputedStyle(el).animationDuration) < .001));
  console.log('PASS: home, empty, auth, both themes, compact windows, exact project/chat routing, new-project wizard route, live Reduce Motion and Performance mode.');
} finally { await browser.close(); server.close(); }
