// Settings > General > Performance on sample data, run from `mobile/`:
//   node scripts/verify-desktop-performance.mjs
// Bundles the desktop pane with its real stylesheets and drives it at 1280 —
// the width a real window has, not the narrow default a fixture would hide
// misalignment behind. Proves the promise each level makes, in computed style
// rather than in prose: Balanced paints exactly like Full, and only Best
// performance takes anything away.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { verifyPerformanceDetail } from './verify-desktop-performance-detail.mjs';
import { verifyPerformancePrivacy } from './verify-desktop-performance-privacy.mjs';

const output = resolve('../output/desktop-performance');
await mkdir(output, { recursive: true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^"]+)"/g)]
  .map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src', m[1]))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/performancePaneFixture.tsx'))};`, resolveDir: process.cwd() },
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  bundle: true, write: false, outfile: '/tmp/performance.js', format: 'iife', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'));
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'));
await writeFile(`${output}/performance.js`, js.contents);
await writeFile(`${output}/performance.css`, css.contents);
const server = createServer((req, res) => {
  const file = req.url.startsWith('/performance.js') ? js : req.url.startsWith('/performance.css') ? css : null;
  res.setHeader('Content-Type', file ? (req.url.startsWith('/performance.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/performance.css"><div id="root"></div><script src="/performance.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });

const LABEL = { full: 'Full', balanced: 'Balanced', best: 'Best performance' };
const failures = [];
const check = async (name, fn) => {
  try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); }
};

const open = async (search) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}/?${search}`);
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  await page.getByRole('radiogroup', { name: 'Performance' }).waitFor();
  return { page, errors };
};
const levels = page => page.getByRole('radiogroup', { name: 'Performance' });
const documentLevel = page => page.evaluate(() => window.documentLevel());
/** What the window is actually spending on looks, read off computed style.
 * Durations come back as seconds, so a level that "stills" motion shows up as
 * a number near zero rather than as a string that has to be pattern-matched. */
const paint = page => page.evaluate(() => {
  const seconds = value => Math.max(...value.split(',').map(part => parseFloat(part) || 0));
  const root = getComputedStyle(document.documentElement);
  return {
    menu: root.getPropertyValue('--e-menu').trim(),
    panel: root.getPropertyValue('--e-panel').trim(),
    dialogAnimation: seconds(getComputedStyle(document.querySelector('[role="dialog"]')).animationDuration),
    moving: [...document.querySelectorAll('*')]
      .filter(node => seconds(getComputedStyle(node).transitionDuration) > 0.001).length,
  };
});

try {
  // 1. Three levels, the right one selected, only Balanced recommended, and
  //    the choice reaching <html> where the stylesheet can see it.
  for (const start of ['full', 'balanced', 'best']) {
    const { page, errors } = await open(`level=${start}`);
    await check(`${start}: three levels in order`, async () => {
      assert.deepEqual(await levels(page).getByRole('radio').allInnerTexts(), ['Full', 'Balanced', 'Best performance']);
    });
    await check(`${start}: the saved level is the selected one`, async () => {
      assert.equal(await levels(page).getByRole('radio', { name: LABEL[start], exact: true }).getAttribute('aria-checked'), 'true');
    });
    await check(`${start}: Recommended marks Balanced and nothing else`, async () => {
      assert.equal(await page.getByText('Recommended', { exact: true }).count() > 0, start === 'balanced');
    });
    await check(`${start}: the level reaches <html>`, async () => {
      assert.equal(await documentLevel(page), start === 'full' ? null : start);
    });
    await check(`${start}: no page errors`, () => assert.deepEqual(errors, []));
    await page.screenshot({ path: `${output}/dark-${start}.png` });
    await page.close();
  }

  // 2. The promise the default rests on. Full and Balanced have to paint the
  //    same; only Best performance may take anything away.
  const { page, errors } = await open('level=full');
  const pick = async (level) => {
    await levels(page).getByRole('radio', { name: LABEL[level], exact: true }).click();
    await page.waitForFunction(want => window.documentLevel() === want, level === 'full' ? null : level);
  };
  const atFull = await paint(page);
  await check('Full is the design as drawn', () => {
    assert.ok(atFull.dialogAnimation > 0.1, `the dialog is not animated at Full (${atFull.dialogAnimation}s), so the comparison proves nothing`);
    assert.ok(atFull.moving > 5, `only ${atFull.moving} elements transition at Full, so the comparison proves nothing`);
    assert.ok(atFull.menu.length > 0 && atFull.panel.length > 0, 'no elevation tokens to compare');
  });

  await pick('balanced');
  await check('Balanced changes nothing on screen', async () => assert.deepEqual(await paint(page), atFull));

  await pick('best');
  const atBest = await paint(page);
  await check('Best performance stills the motion', () => {
    assert.ok(atBest.dialogAnimation < 0.001, `dialog still animates for ${atBest.dialogAnimation}s`);
    assert.equal(atBest.moving, 0, `${atBest.moving} elements still transition`);
  });
  await check('Best performance tightens elevation rather than removing it', () => {
    assert.notEqual(atBest.menu, atFull.menu);
    assert.ok(atBest.menu.includes('px'), `menu shadow was removed entirely: ${atBest.menu}`);
    assert.ok(atBest.menu.length < atFull.menu.length, 'the tight shadow should be the shorter value');
  });

  // 3. Every choice was written to disk, and none of them touched graphics.
  await check('each choice is saved', async () => {
    assert.deepEqual(await page.evaluate(() => window.savedLevels()), ['balanced', 'best']);
  });
  await check('the graphics axis is untouched', async () => {
    assert.deepEqual(await page.evaluate(() => window.savedRendererModes()), ['auto', 'auto']);
  });

  await verifyPerformanceDetail({ page, check, pick, output, errors });
  await verifyPerformancePrivacy({ open, check, output });

  // 7. Light theme too, at the same real window width.
  for (const start of ['balanced', 'best']) {
    const { page: light, errors: lightErrors } = await open(`level=${start}&light`);
    await light.getByRole('button', { name: /^What .+ does$/ }).hover();
    await light.getByRole('tooltip').waitFor();
    await light.screenshot({ path: `${output}/light-${start}-hint.png` });
    await check(`light ${start}: no page errors`, () => assert.deepEqual(lightErrors, []));
    await light.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const line of failures) console.error(`  x ${line}`);
  process.exit(1);
}
console.log(`All Performance checks passed. Screenshots in ${output}`);
