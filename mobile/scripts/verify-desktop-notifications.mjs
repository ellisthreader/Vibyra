// Settings > Notifications on sample values, run from `mobile/`:
//   node scripts/verify-desktop-notifications.mjs
// Bundles the production pane with its real stylesheets and drives it at the
// width a real window has — 1280, not the narrow default a fixture would
// otherwise hide misalignment behind.
//
// What it proves, beyond "it rendered": no control on the page truncates its
// own label (the old channel select showed "Also on ⌄" on every row); the
// switches hold one column down the event list even on rows with no desktop
// or no sound; the volume control states its value in words and commits one
// step per key; the cue menu opens inside the viewport and plays what you
// pick; and no control is filled with the page background, which in this
// outline-only modal reads as a hole cut into the panel.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { verifyNotificationLayout } from './verify-desktop-notifications-layout.mjs';
import { verifyNotificationControls } from './verify-desktop-notifications-controls.mjs';
import { verifyNotificationStates } from './verify-desktop-notifications-states.mjs';

const engine = process.env.VIBYRA_TEST_WEBKIT === '1' ? webkit : chromium;
const output = resolve('../output/desktop-notifications');
await mkdir(output, { recursive: true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^"]+)"/g)]
  .map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src', m[1]))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/notificationsPaneFixture.tsx'))};`, resolveDir: process.cwd() },
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  bundle: true, write: false, outfile: '/tmp/notifications.js', format: 'iife', jsx: 'automatic',
  // RN-web is not in this bundle, but `global` still appears in dependencies;
  // without the define the tree unmounts and every assertion reads as a timeout.
  define: { global: 'globalThis' },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.mp4': 'dataurl' },
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'));
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'));
await writeFile(`${output}/notifications.js`, js.contents);
await writeFile(`${output}/notifications.css`, css.contents);
const server = createServer((req, res) => {
  const file = req.url.startsWith('/notifications.js') ? js : req.url.startsWith('/notifications.css') ? css : null;
  res.setHeader('Content-Type', file ? (req.url.startsWith('/notifications.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/notifications.css"><div id="root"></div><script src="/notifications.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await engine.launch(engine === chromium
  ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }
  : { headless: true });

const open = async (search = '', size = { width: 1280, height: 900 }, platform) => {
  const page = await browser.newPage({ viewport: size });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (platform) await page.addInitScript(value => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value });
  }, platform);
  await page.goto(`${url}/?${search}`);
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  return { page, errors };
};
const shot = async (page, name) => {
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${output}/${name}.png` });
};

/** Every element whose own text is wider than the box drawn for it. */
const truncated = (page) => page.evaluate(() => [...document.querySelectorAll('.settings-pane__body *, .cuepick-menu *')]
  .filter(el => el.childElementCount === 0 && el.textContent.trim())
  .filter(el => el.scrollWidth > el.clientWidth + 1)
  .map(el => `${el.className || el.tagName}: ${el.textContent.trim().slice(0, 40)}`));

/** A control filled with the page background is a hole cut into the panel;
 * groups here are outlines, so the ground is the modal, not `--bg`. Resolves
 * `--bg` through a probe element rather than parsing the token, and compares
 * alpha too — a faint wash of the page colour is the same mistake. */
const holes = (page) => page.evaluate(() => {
  const parse = (value) => {
    const n = value.match(/[\d.]+/g);
    return n && Number(n[3] ?? 1) > 0 ? { r: +n[0], g: +n[1], b: +n[2], a: Number(n[3] ?? 1) } : null;
  };
  const probe = document.createElement('div');
  probe.style.background = 'var(--bg)';
  document.body.appendChild(probe);
  const bg = parse(getComputedStyle(probe).backgroundColor);
  probe.remove();
  const near = (a, b) => a && b && Math.abs(a.r - b.r) < 4 && Math.abs(a.g - b.g) < 4 && Math.abs(a.b - b.b) < 4;
  return [...document.querySelectorAll(
    // Fills only. A thumb, a switch knob and a chip are meant to be bright
    // objects sitting on the panel, not flat control grounds.
    '.notif-event__os, .cuepick, .cuepick-menu, .cuepick-menu__option, .volslider__rail, .volslider__track',
  )]
    .filter((el) => {
      const own = parse(getComputedStyle(el).backgroundColor);
      return near(own, bg);
    })
    .map((el) => `${el.className}: ${getComputedStyle(el).backgroundColor}`);
});

try {
  await verifyNotificationLayout({ open, shot, truncated, holes });
  await verifyNotificationControls({ open, shot, truncated, holes });
  await verifyNotificationStates({ open, shot, truncated });
  console.log(`Settings > Notifications verified. Screenshots in ${output}`);
} finally {
  await browser.close();
  server.close();
}
