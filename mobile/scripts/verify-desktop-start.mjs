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
  for (const theme of ['dark', 'light']) for (const screen of (process.env.VIBYRA_HOME_ONLY ? ['home', 'empty'] : process.env.VIBYRA_AUTH_ONLY ? ['auth'] : ['home', 'empty', 'auth'])) {
    const page = await browser.newPage({ viewport: { width: 1328, height: 900 } });
    page.setDefaultTimeout(7000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?${theme}&${screen}`);
    await page.locator(screen === 'auth' ? '.brand__mark' : '.sb-home__inner').waitFor();
    await page.waitForTimeout(screen === 'auth' ? 2600 : 300);
    await page.screenshot({ path: `${output}/${screen}-${theme}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (screen === 'home') assert.equal(await page.locator('.sb-spot').count(), 1, 'Home spotlights the project used last (owner 2026-10-05, option A)');
    if (screen === 'home') assert.equal(await page.locator('.sb-tiles .sb-ptile').count(), 2, 'every other project is a tile');
    if (screen === 'empty') assert.equal(await page.locator('.sb-home__empty').count(), 1);
    if (screen === 'auth') assert.equal(await page.locator('.brand__mark img').evaluate(el => el.complete && el.naturalWidth > 0), true);
    else assert.equal(await page.locator('.sb-home h1').textContent(), 'Home', 'Home carries no greeting headline (owner 2026-10-05)');
    if (screen === 'auth') {
      await page.setViewportSize({ width:1280, height:800 });
      const reference = await browser.newPage({ viewport:{ width:1280, height:800 } });
      await reference.goto(`http://127.0.0.1:8874/concept.html?concept=pocket&theme=${theme}`);
      await reference.waitForTimeout(1800);
      for (const selector of ['.login', '.brand__mark img', '.login-heading', '.pocket-campaign > h2', '.pocket-showcase-title', '.iphone']) {
        const actual = await page.locator(selector).boundingBox();
        const approved = await reference.locator(selector).boundingBox();
        for (const key of ['x','y','width','height']) assert.ok(Math.abs(actual[key] - approved[key]) < 3, `${selector} ${key}: ${actual[key]} vs ${approved[key]}`);
      }
      await reference.close();
      await page.screenshot({ path: `${output}/auth-${theme}-approved.png` });
      await page.getByRole('button', { name: /Explore the iPhone app/i }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: 'Back to sign in' }).click();
      await page.getByRole('button', { name: 'Continue with Apple' }).click();
      assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['oauth', 'apple']);
      await page.getByRole('button', { name: 'Continue with Google' }).click();
      assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['oauth', 'google']);
      await page.getByRole('button', { name: /Continue with email/i }).click();
      await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('test@example.test');
      await page.setViewportSize({ width: 600, height: 560 });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Sign in', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/auth-email-${theme}-compact.png` });
      assert.ok(await page.getByRole('textbox', { name: 'Email address', exact: true }).isVisible());
      await page.getByLabel('Password', { exact:true }).fill('fixture-password');
      await page.getByRole('button', { name:'Sign in', exact:true }).click();
      assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['login', 'test@example.test', 'fixture-password']);
      await page.getByRole('button', { name:'Forgot password?' }).click();
      await page.getByRole('button', { name:'Send reset link' }).click();
      assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['forgot', 'test@example.test']);
      await page.getByRole('button', { name:/All sign-in options/ }).click();
      await page.getByRole('button', { name:'Continue with email' }).click();
      assert.equal(await page.getByRole('button', { name:'Sign in', exact:true }).count(), 1, 'reopening email exits recovery');
      await page.getByRole('button', { name:/All sign-in options/ }).click();
      await page.getByRole('button', { name:'Create an account' }).click();
      await page.getByLabel('Your name').fill('Sample');
      await page.getByLabel('Email address', { exact:true }).fill('sample@example.test');
      await page.getByLabel('Password', { exact:true }).fill('fixture-password');
      await page.getByRole('button', { name:'Create account', exact:true }).click();
      assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['signup', 'Sample', 'sample@example.test', 'fixture-password']);
      const compactLogin = await page.locator('.login').boundingBox();
      const compactAd = await page.locator('.pocket-campaign').boundingBox();
      assert.ok(Math.abs(compactLogin.x + compactLogin.width / 2 - 300) < 1, 'compact login remains centred');
      assert.ok(compactAd.y >= compactLogin.y + compactLogin.height, 'compact promotion follows authentication');
      await page.screenshot({ path: `${output}/auth-signup-${theme}-compact.png` });
    } else {
      if (screen === 'home') {
        await page.locator('.sb-agent--working').waitFor(); await page.locator('.sb-agent--done').waitFor();
        assert.equal(await page.locator('.sb-agent--working .sb-agent__ask').innerText(), 'Run audit of code base', 'each agent shows what you asked');
        assert.equal(await page.locator('.sb-spot .sb-agent__now, .sb-spot .sb-agent__bar').count(), 0, 'agents are rows, never boxes in boxes (owner 2026-10-05)');
        assert.equal(await page.locator('.sb-agent--working code').innerText(), "rg -n 'adopt_session' src/account_login.rs", 'a working agent shows its live step');
        assert.match(await page.locator('.sb-agent--done .sb-agent__detail').innerText(), /^Found six additional issues\./, 'a finished agent shows what it found');
        assert.equal(await page.locator('.sb-agent--done .sb-agent__meta').innerText(), '8m ago');
        await page.screenshot({ path: `${output}/home-agents-${theme}.png` });
        await page.locator('.sb-agent--working').click();
        await page.waitForFunction(() => window.startEvents.at(-1)?.[0] === 'activate');
        assert.deepEqual(await page.evaluate(() => window.startEvents.at(-1)), ['activate', 'studio']);
      }
      await page.getByRole('button', { name: 'New project', exact: true }).first().click();
      assert.equal(await page.evaluate(() => window.startView()), 'new-project');
      await page.setViewportSize({ width: 960, height: 640 });
      await page.screenshot({ path: `${output}/${screen}-${theme}-compact.png` });
      assert.equal(await page.locator('.homeview').evaluate(el => el.scrollWidth > el.clientWidth), false);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator(screen === 'auth' ? '.brand__mark' : '.sb-home__section').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator(screen === 'auth' ? '.auth-card' : '.sb-home__section').first().evaluate(el => getComputedStyle(el).opacity), '1');
    assert.deepEqual(errors, []); await page.close();
  }
  for (const name of ['Alexandra-Catherine', '']) {
    const personal = await browser.newPage({ viewport: { width: 960, height: 640 }, reducedMotion: 'reduce' });
    await personal.goto(`${url}/?empty&name=${encodeURIComponent(name)}`);
    assert.equal(await personal.locator('.sb-home h1').textContent(), 'Home');
    assert.match(await personal.locator('.frame-identity__copy strong').innerText(), name ? /^Alexandra-Catherine's workspace$/ : /workspace$/);
    assert.equal(await personal.locator('.homeview').evaluate(el => el.scrollWidth > el.clientWidth), false);
    await personal.close();
  }
  const motion = await browser.newPage({ viewport: { width: 1328, height: 900 } });
  await motion.goto(`${url}/?empty`);
  const head = motion.locator('.sb-home__inner');
  await head.waitFor();
  await motion.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
  const settled = await head.screenshot();
  await motion.waitForTimeout(300);
  assert.deepEqual(settled, await head.screenshot(), 'Home has no idle motion');
  await motion.getByRole('button', { name: 'New project', exact: true }).first().focus();
  await motion.keyboard.press('Enter');
  assert.equal(await motion.evaluate(() => window.startView()), 'new-project');
  await motion.close();
  const page = await browser.newPage(); await page.goto(`${url}/?performance&empty`); await page.waitForTimeout(100);
  assert.equal(await page.locator('.sb-home__empty').evaluate(el => getComputedStyle(el).opacity), '1');
  { // The bell panel clears one notification or all of them (owner 2026-10-05).
    const bell = await browser.newPage({ viewport: { width: 1328, height: 900 } });
    await bell.goto(`${url}/?notifications`);
    await bell.getByRole('button', { name: /Notifications/ }).first().click();
    const rows = bell.locator('.nrow'); await rows.first().waitFor();
    const before = await rows.count();
    await bell.getByRole('button', { name: /^Dismiss: / }).first().click();
    assert.equal(await rows.count(), before - 1, 'one notification can be cleared on its own');
    await bell.getByRole('button', { name: /Clear all/ }).click();
    await bell.waitForFunction(() => document.querySelectorAll('.nrow').length === 0);
    await bell.close();
  }
  console.log(process.env.VIBYRA_HOME_ONLY
    ? 'PASS: Home and empty states, both themes, compact windows, project/chat routing, new-project route and reduced motion.'
    : 'PASS: home, empty, auth, both themes, compact windows, exact project/chat routing, new-project wizard route, live Reduce Motion and Performance mode.');
} finally { await browser.close(); server.close(); }
