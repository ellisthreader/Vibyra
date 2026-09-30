// Settings > Advanced on sample values, run from `mobile/`:
//   node scripts/verify-desktop-advanced.mjs
// Bundles the desktop pane with its real stylesheets and drives it at the
// width a real window has — 1280, not the narrow default a fixture would
// otherwise hide misalignment behind. What it proves: the groups are in the
// order the pane claims, every voice control is on this page rather than
// filed under a keyboard shortcut, and each one reaches the call it
// parameterises — a voice, a rate and a style all arriving at `speech_start`.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const output = resolve('../output/desktop-advanced');
await mkdir(output, { recursive: true });
const entry = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...entry.matchAll(/import "(\.\/styles\/[^"]+)"/g)]
  .map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src', m[1]))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/advancedPaneFixture.tsx'))};`, resolveDir: process.cwd() },
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  bundle: true, write: false, outfile: '/tmp/advanced.js', format: 'iife', jsx: 'automatic',
  // RN-web style Animated stops throw without this, and the failure shows up
  // as a text-visibility timeout rather than as the error it is.
  define: { global: 'window' },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'));
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'));
await writeFile(`${output}/advanced.js`, js.contents);
await writeFile(`${output}/advanced.css`, css.contents);
const server = createServer((req, res) => {
  const file = req.url.startsWith('/advanced.js') ? js : req.url.startsWith('/advanced.css') ? css : null;
  res.setHeader('Content-Type', file ? (req.url.startsWith('/advanced.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/advanced.css"><div id="root"></div><script src="/advanced.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const open = async (search = '') => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?${search}`);
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  return { page, errors };
};
const events = (page) => page.evaluate(() => window.advancedEvents);
const last = (page) => page.evaluate(() => window.advancedLast());
const shot = async (page, name) => {
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${output}/${name}.png` });
};

try {
  for (const theme of ['dark', 'light']) {
    const t = theme === 'light' ? 'light' : '';
    const { page, errors } = await open(t);

    // ── the order the pane promises ──────────────────────────────────────
    // Assistant first, then the workspace, then the machine. Graphics is
    // absent off Linux rather than present and inert.
    const titles = await page.locator('.disclosure__title').allInnerTexts();
    assert.deepEqual(titles, [
      'Voice and speech',
      'Terminal',
      'Files and screenshots',
      'Runtimes',
    ], 'Advanced groups must stay in their stated order');
    // The service credential is the deployment's. Nothing on this page offers
    // to change it, and no spend cap is the user's to raise.
    for (const gone of [/OpenAI key/i, /spending/i, /Usage and limits/i, /API key/i]) {
      assert.equal(await page.getByText(gone).count(), 0, `Advanced still shows ${gone}`);
    }
    await page.getByText('Rarely changed.').waitFor();

    // A collapsed group still says what it is set to, so the page can be read
    // without opening five things.
    const voiceGroup = page.locator('.disclosure', { hasText: 'Voice and speech' }).first();
    assert.equal(await voiceGroup.locator('.disclosure__summary').innerText(), 'Nova · 1×');
    await shot(page, `advanced-${theme}`);

    // ── every voice control is here, and none of it is a shortcut ────────
    await page.getByRole('button', { name: /Voice and speech/ }).click();
    const picker = page.locator('select[aria-label="Spoken voice"]');
    await picker.waitFor();
    assert.deepEqual(await picker.locator('option').allInnerTexts(),
      ['Vibyra default', 'Alloy', 'Nova', 'Shimmer'], "Vibyra's own voices, not the Mac's");
    for (const label of ['Speaking speed', 'Speaking style', 'Voice typing language', 'Pause before it answers']) {
      await page.getByRole('group', { name: label }).first().waitFor();
    }
    await shot(page, `voice-${theme}`);

    // ── each control reaches the call it parameterises ───────────────────
    await page.getByRole('radio', { name: '1.25×' }).click();
    assert.deepEqual((await last(page)), ['update', { speechRate: 1.25 }]);
    await page.getByRole('radio', { name: 'Long' }).click();
    assert.deepEqual((await last(page)), ['update', { talkPauseMs: 1800 }]);
    await page.selectOption('select[aria-label="Voice typing language"]', 'fr');
    assert.deepEqual((await last(page)), ['update', { voiceLanguage: 'fr' }]);
    // Typed text waits for you to finish: nothing is saved per keystroke.
    const style = page.getByRole('textbox', { name: 'Speaking style' });
    await style.fill('Warm and unhurried');
    assert.equal((await last(page))[0], 'update', 'typing must not commit on every key');
    await style.blur();
    assert.deepEqual((await last(page)), ['commit', { speechStyle: 'Warm and unhurried' }]);

    // Test speaks with everything the page is currently set to — the whole
    // point of keeping the button beside the controls that shape it.
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    const [command, payload] = await last(page);
    assert.equal(command, 'speech_start');
    assert.equal(payload.voice, 'nova');
    assert.equal(payload.rate, 1.25);
    assert.equal(payload.style, 'Warm and unhurried');

    // ── the page holds together at a real window width ───────────────────
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
      'Advanced must not scroll sideways at 1280');
    assert.equal(await page.evaluate(async () => {
      const body = document.querySelector('.settings-pane__body');
      body.scrollTop = body.scrollHeight;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const rows = [...document.querySelectorAll('.setting-row')];
      const frame = body.getBoundingClientRect();
      const last = rows.at(-1).getBoundingClientRect();
      return last.bottom <= frame.bottom + 1;
    }), true, 'the last row must be reachable by scrolling');
    assert.equal(await events(page).then(list => list.some(([c]) => c === 'project_brief')), false,
      'Settings must not stream a project brief just to draw itself');

    // ── one family of control, not two ───────────────────────────────────
    // The complaint this fixes: buttons were filled with `--bg` while the
    // segmented controls beside them used the `--hover` wash, so one row held
    // a black control and a grey one. Comparing against the panel is the wrong
    // test — a light theme tints downwards on purpose — so the assertion is
    // that every neutral control on a row paints the *same* fill, at the same
    // height. `--primary`/`--danger`/`--ghost` are meant to differ.
    const family = await page.evaluate(() => {
      const neutral = [...document.querySelectorAll('.setting-row__control .btn, .setting-row__control .segmented, .setting-row__control .stepper')]
        .filter(e => !/btn--(primary|danger|ghost)/.test(e.className));
      return {
        count: neutral.length,
        fills: [...new Set(neutral.map(e => getComputedStyle(e).backgroundColor))],
        heights: [...new Set(neutral.map(e => Math.round(e.getBoundingClientRect().height)))],
      };
    });
    assert.ok(family.count >= 3, `only found ${family.count} row controls`);
    assert.deepEqual(family.heights, [28], `mixed control heights: ${family.heights}`);
    assert.equal(family.fills.length, 1, `mixed control fills on one page: ${family.fills.join(' vs ')}`);

    assert.deepEqual(errors, []);
    await page.close();
  }

  // ── a hand-edited settings.json still lands on one of our choices ──────
  const odd = await open('rate=1.44&pause=5000&voiceName=shimmer');
  await odd.page.getByRole('button', { name: /Voice and speech/ }).click();
  assert.equal(await odd.page.getByRole('radio', { name: '1.5×', checked: true }).count(), 1,
    'an unlisted rate shows as the nearest offered one');
  assert.equal(await odd.page.getByRole('radio', { name: 'Long', checked: true }).count(), 1);
  assert.deepEqual(odd.errors, []);
  await odd.page.close();

  console.log('PASS: Settings > Advanced — four groups in order, no API key or spend caps, every voice control on this page, rate/style/language/pause each reaching their call, Test speaking with all of them, at 1280 on both themes.');
} finally {
  await browser.close();
  server.close();
}
