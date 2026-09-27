// Settings > Accounts on sample data, run from `mobile/`:
//   node scripts/verify-desktop-accounts.mjs
// Bundles the desktop pane with its real stylesheets and drives it at 1280 —
// the width a real window has. Covers the page itself, the More dialog opened
// from it, and that switching an agent on there reaches the settings store.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { verifyAccountInstalls } from './verify-desktop-accounts-install.mjs';

const output = resolve('../output/desktop-accounts');
await mkdir(output, { recursive: true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^"]+)"/g)]
  .map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src', m[1]))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/accountsPaneFixture.tsx'))};`, resolveDir: process.cwd() },
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  bundle: true, write: false, outfile: '/tmp/accounts.js', format: 'iife', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'));
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'));
await writeFile(`${output}/accounts.js`, js.contents);
await writeFile(`${output}/accounts.css`, css.contents);
const server = createServer((req, res) => {
  const file = req.url.startsWith('/accounts.js') ? js : req.url.startsWith('/accounts.css') ? css : null;
  res.setHeader('Content-Type', file ? (req.url.startsWith('/accounts.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/accounts.css"><div id="root"></div><script src="/accounts.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });

const failures = [];
const check = async (name, fn) => {
  try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); }
};
const open = async (search = '') => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}/?${search}`);
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  return { page, errors };
};
// Modals fade up over 220ms; a shot taken the moment one attaches catches it
// half see-through and reads as a styling bug.
const settle = page => page.evaluate(() =>
  Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
const shot = async (page, name) => { await settle(page); await page.screenshot({ path: name }); };
const moreButton = page => page.getByRole('button', { name: 'Browse', exact: true });
const dialog = page => page.getByRole('dialog', { name: 'More agents' });

try {
  // 1. The nav says Accounts, and the section is still reachable by that name.
  {
    const { page, errors } = await open();
    await check('the nav item is called Accounts', async () => {
      await page.getByRole('button', { name: 'Accounts', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'AI accounts', exact: true }).count(), 0);
    });
    await check('Account and Accounts are both present and distinct', async () => {
      // A known collision: the Vibyra account page is still called Account.
      assert.equal(await page.getByRole('button', { name: 'Accounts', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Account', exact: true }).count(), 1);
    });
    await check('only the three company accounts are on the page itself', async () => {
      // The cards are titled by company — OpenAI, Anthropic, Google — and name
      // the product in their detail line. Codex/Claude/Gemini are those three.
      for (const name of ['OpenAI', 'Anthropic', 'Google']) {
        assert.ok(await page.getByText(name, { exact: true }).count() > 0, `${name} missing`);
      }
      const pane = await page.locator('.settings-integrations').innerText();
      for (const name of ['Qwen Code', 'Aider', 'OpenCode']) {
        // Named once on the More row, and nowhere else on the page.
        assert.equal(pane.split(name).length - 1, 1, `${name} should only appear on the More row`);
      }
    });
    await check('More is visible without opening anything', async () => {
      await moreButton(page).waitFor();
      const box = await moreButton(page).boundingBox();
      assert.ok(box.y > 0 && box.y < 900, `More sits at y=${box.y}`);
      await page.getByText('Other agents', { exact: true }).waitFor();
    });
    await check('the More row names what is behind it', async () => {
      const hint = await page.getByText('Other agents', { exact: true })
        .locator('xpath=../..').innerText();
      for (const name of ['Qwen Code', 'Aider', 'OpenCode']) {
        assert.ok(hint.includes(name), `${name} not named on the row`);
      }
    });
    await shot(page, `${output}/dark-accounts.png`);
    await check('page: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }

  // 2. The dialog: every agent Vibyra can launch, and nothing it cannot.
  {
    const { page, errors } = await open('installed=qwen,aider');
    await moreButton(page).click();
    await dialog(page).waitFor();
    await check('the dialog lists exactly the catalog agents that are not accounts', async () => {
      const rows = await dialog(page).locator('.agent-row__name').allInnerTexts();
      assert.deepEqual(rows.map(t => t.trim()).sort(),
        ['Aider', 'Amp', 'Continue', 'Crush', 'GitHub Copilot', 'OpenCode', 'Qwen Code']);
    });
    await check('the company agents are never repeated inside it', async () => {
      const text = await dialog(page).innerText();
      for (const name of ['Codex', 'Claude Code', 'Gemini']) {
        assert.ok(!new RegExp(`\\b${name}\\b`).test(text.replace('Codex, Claude and Gemini', '')), `${name} repeated`);
      }
    });
    await check('installed agents get a switch, installable ones get Install', async () => {
      assert.equal(await dialog(page).getByRole('switch').count(), 2, 'qwen and aider are installed here');
      // Everything but Aider is an npm package Vibyra installs itself.
      assert.equal(await dialog(page).getByRole('button', { name: 'Install' }).count(), 5);
    });
    await check('every row has exactly one control', async () => {
      const rows = await dialog(page).locator('.agent-row').count();
      const controls = await dialog(page).locator('.agent-row button, .agent-row [role="switch"]').count();
      assert.equal(controls, rows, `${controls} controls across ${rows} rows`);
    });
    await check('the header says what is in the launcher', async () => {
      assert.match(await dialog(page).locator('.modal__subtitle').innerText(), /Install one to add it/);
    });
    await shot(page, `${output}/dark-more-agents.png`);
    await check('dialog: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }

  // 3. It actually works: a switch in the dialog reaches the settings store.
  {
    const { page, errors } = await open('installed=qwen,aider');
    await moreButton(page).click();
    await dialog(page).waitFor();
    await check('switching an agent on saves it and shows in the count', async () => {
      // A signed-in provider already enables its own runtime, so the baseline
      // is codex and claude — not an empty list.
      const before = await page.evaluate(() => window.currentEnabled());
      assert.ok(!before.includes('qwen'), `qwen was already on: ${before}`);
      await dialog(page).getByRole('switch', { name: /Qwen Code/ }).click();
      await page.waitForFunction(() => window.currentEnabled().includes('qwen'));
      assert.ok((await page.evaluate(() => window.savedEnabled())).some(v => v.includes('qwen')), 'never written');
    });
    await check('switching it off again removes it', async () => {
      await dialog(page).getByRole('switch', { name: /Qwen Code/ }).click();
      await page.waitForFunction(() => !window.currentEnabled().includes('qwen'));
    });
    await check('the page behind counts only what is on', async () => {
      await dialog(page).getByRole('switch', { name: /Aider/ }).click();
      await page.waitForFunction(() => window.currentEnabled().includes('aider'));
      await page.keyboard.press('Escape');
      await dialog(page).waitFor({ state: 'detached' });
      await page.getByText('1 on', { exact: true }).waitFor();
    });
    await check('Escape closed the dialog and left Settings open', async () => {
      await page.getByRole('dialog', { name: 'Settings' }).waitFor();
    });
    await check('reopening shows the choice that was made', async () => {
      await moreButton(page).click();
      await dialog(page).waitFor();
      assert.equal(await dialog(page).getByRole('switch', { name: /Aider/ }).getAttribute('aria-checked'), 'true');
      await page.getByRole('button', { name: 'Done' }).click();
      await dialog(page).waitFor({ state: 'detached' });
    });
    await check('flow: no errors', () => assert.deepEqual(errors, []));
    await page.close();
  }

  await verifyAccountInstalls({ open, check, moreButton, dialog, shot, output });
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const line of failures) console.error(`  x ${line}`);
  process.exit(1);
}
console.log(`All Accounts checks passed. Screenshots in ${output}`);
