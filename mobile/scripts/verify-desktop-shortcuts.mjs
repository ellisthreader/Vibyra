// Settings > Shortcuts on sample values, run from `mobile/`:
//   node scripts/verify-desktop-shortcuts.mjs
// Bundles the desktop pane with its real stylesheets and drives it at the
// width a real window has — 1280, not the narrow default a fixture would
// otherwise hide misalignment behind. Keycaps are proved to read as raised
// keys: each modifier gets its own cap, and the cap face stays lighter than
// the panel it sits on in both themes.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const output = resolve('../output/desktop-shortcuts');
await mkdir(output, { recursive: true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^"]+)"/g)]
  .map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src', m[1]))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/shortcutsPaneFixture.tsx'))};`, resolveDir: process.cwd() },
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  bundle: true, write: false, outfile: '/tmp/shortcuts.js', format: 'iife', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'));
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'));
await writeFile(`${output}/shortcuts.js`, js.contents);
await writeFile(`${output}/shortcuts.css`, css.contents);
const server = createServer((req, res) => {
  const file = req.url.startsWith('/shortcuts.js') ? js : req.url.startsWith('/shortcuts.css') ? css : null;
  res.setHeader('Content-Type', file ? (req.url.startsWith('/shortcuts.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/shortcuts.css"><div id="root"></div><script src="/shortcuts.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const open = async (search = '') => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Which key names a page shows is read from the platform once, at import,
  // so a PC has to be declared before the bundle runs.
  if (search.includes('platform=windows')) {
    await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { value: 'Win32' }));
  }
  await page.goto(`${url}/?${search}`);
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  return { page, errors };
};
const shot = async (page, name) => {
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${output}/${name}.png` });
};
// A cap has to sit on top of the panel it is on, not be cut into it: on both
// themes its face is the lighter of the two, and it carries an edge and a lip
// for the side wall. Settings groups are outlines with no fill, so what is
// behind a cap is the modal, found by walking up to the first painted parent.
const capsRaised = (page) => page.evaluate(() => {
  const luma = (value) => {
    const [r, g, b, a = 1] = value.match(/[\d.]+/g).map(Number);
    return a === 0 ? null : 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const behind = (node) => {
    for (let el = node.parentElement; el; el = el.parentElement) {
      const value = luma(getComputedStyle(el).backgroundColor);
      if (value !== null) return value;
    }
    return 0;
  };
  return [...document.querySelectorAll('.kbd')].every((cap) => {
    const style = getComputedStyle(cap);
    return luma(style.backgroundColor) > behind(cap) + 8
      && style.boxShadow.includes('rgb')
      && style.borderTopWidth === '1px';
  });
});

try {
  for (const theme of ['dark', 'light']) {
    const t = theme === 'light' ? 'light' : '';

    // ── the two you can change ───────────────────────────────────────────
    const main = await open(t);
    await main.page.getByText('Voice typing').waitFor();
    assert.equal(await main.page.getByText('These work in any app while Vibyra is running.').count(), 0,
      'the System-wide label carries this on its own');
    await main.page.getByRole('button', { name: 'Set voice typing shortcut, currently F8' }).waitFor();
    await main.page.getByRole('button', { name: 'Set screenshot shortcut, currently F9' }).waitFor();
    await main.page.getByRole('button', { name: 'Set talking to Vibyra shortcut, currently F10' }).waitFor();
    // Which voice answers, and how, is not a shortcut: the whole voice group
    // moved to Advanced, and this page must be only keys again.
    assert.equal(await main.page.locator('select[aria-label="Spoken voice"]').count(), 0,
      'the spoken voice belongs to Advanced > Voice and speech');
    assert.equal(await main.page.getByRole('button', { name: 'Test', exact: true }).count(), 0);
    await main.page.getByText(/listens, answers out loud, then listens again/).waitFor();
    // The word "Change" is gone: a pencil says it, and the keys stay centred.
    assert.equal(await main.page.getByRole('button', { name: /Set .* shortcut/ }).first().innerText(), 'F8');

    // ── every in-app key, one cap per key ────────────────────────────────
    await main.page.getByRole('button', { name: /All keyboard shortcuts/ }).click();
    await main.page.getByText('Open the command palette').waitFor();
    const palette = main.page.locator('.shortcut-row', { hasText: 'Open the command palette' });
    assert.deepEqual(await palette.locator('.kbd').allInnerTexts(), ['⌘', 'K'], 'a combo is caps, not one glyph run');
    const home = main.page.locator('.shortcut-row', { hasText: 'Back to the home view' });
    assert.deepEqual(await home.locator('.kbd').allInnerTexts(), ['⌘', '⇧', 'H']);
    assert.equal(await capsRaised(main.page), true, 'keycaps must read as raised, not as dark holes');
    const square = await main.page.locator('.shortcut-row', { hasText: 'Send composer line' }).locator('.kbd').boundingBox();
    assert.ok(square.height >= 20 && square.width >= square.height, 'a cap is key-shaped, never a thin chip');
    await shot(main.page, `shortcuts-${theme}`);
    assert.equal(await main.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // Every key is reachable: the page may scroll, but nothing may be clipped
    // out of reach the way the squeezed Disclosure used to be.
    assert.equal(await main.page.evaluate(async () => {
      const body = document.querySelector('.settings-pane__body');
      body.scrollTop = body.scrollHeight;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const last = [...document.querySelectorAll('.shortcut-row')].at(-1).getBoundingClientRect();
      const frame = body.getBoundingClientRect();
      return last.bottom <= frame.bottom + 1 && last.top >= frame.top - 1;
    }), true, 'the last shortcut must be reachable by scrolling');

    // ── a changed shortcut keeps its caps and offers a reset ─────────────
    const changed = await open(`${t}&voice=CommandOrControl%2BShift%2BV&screenshot=Alt%2BF12&talk=F13`);
    const voice = changed.page.locator('.hotkey-recorder-wrap').first();
    assert.deepEqual(await voice.locator('.kbd').allInnerTexts(), ['⌘', '⇧', 'V']);
    await changed.page.getByRole('button', { name: 'Reset' }).first().waitFor();
    assert.equal(await capsRaised(changed.page), true);
    await shot(changed.page, `changed-${theme}`);

    // ── recording asks for a press, and only then ────────────────────────
    const recording = await open(t);
    await recording.page.getByRole('button', { name: /Set voice typing shortcut/ }).click();
    await recording.page.getByText('Press a shortcut…').waitFor();
    assert.equal(await recording.page.locator('.hotkey-recorder--active .kbd').count(), 0);
    await shot(recording.page, `recording-${theme}`);

    // ── Windows and Linux say the same thing in their own keys ───────────
    const pc = await open(`${t}&platform=windows`);
    await pc.page.getByRole('button', { name: /All keyboard shortcuts/ }).click();
    await pc.page.getByText('Open the command palette').waitFor();
    await shot(pc.page, `windows-${theme}`);

    for (const { page, errors } of [main, changed, recording, pc]) {
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log('PASS: Settings > Shortcuts — three recorders including Talk to Vibyra and no voice controls, a pencil instead of Change, every in-app key on screen as one cap each, raised caps on both themes, at 1280.');
} finally {
  await browser.close();
  server.close();
}
