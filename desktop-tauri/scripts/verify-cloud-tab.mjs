// Settings → Cloud and Connect to cloud, rendered with the real components and stores (native commands are sample
// data) at a real window size in both themes. Screenshots go to ../output/cloud-parity/.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';

const output = resolve('../output/cloud-parity');
await mkdir(output, { recursive: true });
const entry = await readFile('src/main.tsx', 'utf8');
const styles = [...entry.matchAll(/import "(\.\/styles\/[^"\n]+\.css)";/g)]
  .map(([, path]) => `import ${JSON.stringify(resolve('src', path))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport './tests/cloudTabFixture.tsx';`, resolveDir: process.cwd() },
  bundle: true, write: false, outfile: '/tmp/cloud-tab.js', format: 'iife', jsx: 'automatic', define: { global: 'window' },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  plugins: [{ name: 'fixture-art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
const html = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>';
const server = createServer((req, res) => {
  const isJs = req.url.startsWith('/app.js'), isCss = req.url.startsWith('/style.css');
  res.setHeader('Content-Type', isJs ? 'text/javascript' : isCss ? 'text/css' : 'text/html');
  res.end(isJs ? js : isCss ? css : html);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = process.argv.includes('--webkit') ? await webkit.launch() : await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const open = async (query, theme = 'dark', small = false) => {
  const page = await browser.newPage({ viewport: small ? { width: 960, height: 600 } : { width: 1280, height: 820 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${url}/?${query}${theme === 'light' ? '&light' : ''}`);
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
  return page;
};
const shot = (page, name) => page.screenshot({ path: `${output}/${name}${process.argv.includes('--webkit') ? '-webkit' : ''}.png` });
try {
  const { verifyCloudSetup } = await import('./verify-cloud-setup-cases.mjs');
  const { verifyCloudLifecycle } = await import('./verify-cloud-lifecycle-cases.mjs');
  await verifyCloudSetup({ open, shot });
  await verifyCloudLifecycle({ open, shot });
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('PASS Cloud setup, updates, visibility and lifecycle');
} finally { await browser.close(); server.close(); }
