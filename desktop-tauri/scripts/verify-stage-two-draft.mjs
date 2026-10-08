import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const output = resolve('../output/agent-stage2-20261008/draft-desktop');
await mkdir(output, { recursive: true });
const entry = await readFile('src/main.tsx', 'utf8');
const styles = [...entry.matchAll(/import "(\.\/styles\/[^"\n]+\.css)";/g)].map(([, p]) => `import ${JSON.stringify(resolve('src', p))};`).join('\n');
const bundle = await build({ stdin: { contents: `${styles}\nimport './tests/stageTwoDraftFixture.tsx';`, resolveDir: process.cwd() }, bundle: true, write: false, outfile: '/tmp/stage-two-draft.js', format: 'iife', jsx: 'automatic', define: { global: 'window' }, loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' }, plugins: [{ name: 'draft-api', setup(b) { b.onLoad({ filter: /emailDraftUpload\.ts$/ }, () => ({ contents: `export { uploadDraftFile } from ${JSON.stringify(resolve('tests/stageTwoDraftApi.ts'))}`, loader: 'ts' })); b.onLoad({ filter: /components\/teammates\/api\.ts$/ }, () => ({ contents: `export * from ${JSON.stringify(resolve('tests/stageTwoDraftApi.ts'))}`, loader: 'ts' })); } }] });
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text, css = bundle.outputFiles.find(f => f.path.endsWith('.css')).text;
const html = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>';
const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html'); res.end(req.url === '/app.js' ? js : req.url === '/style.css' ? css : html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence = [];
try {
  for (const theme of ['dark', 'light']) for (const width of [960, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme === 'light' ? 'light' : ''}`);
    await page.getByRole('button', { name: 'Edit email draft', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Send once', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Discard', exact: true }).isDisabled(), true);
    await page.getByLabel('Email to', { exact: true }).fill('edited@example.test');
    await page.getByLabel('Email subject', { exact: true }).fill('Edited subject');
    await page.getByLabel('Email body', { exact: true }).fill('Reviewed edited body.');
    await page.getByLabel('Email from', { exact: true }).selectOption('connection-2');
    for (let i = 1; i <= 4; i++) {
      await page.locator('input[type=file]').setInputFiles({ name: `Reviewed-attachment-${i}-with-a-long-filename.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Reviewed file ${i}`) });
      await page.getByRole('button', { name: `Remove Reviewed-attachment-${i}-with-a-long-filename.txt`, exact: true }).waitFor();
    }
    assert.equal(await page.getByRole('button', { name: 'Add attachment', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Four long filenames fit the editor');
    await page.screenshot({ path: `${output}/four-files-${theme}-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => window.draftFixture.calls.some(c => c.method === 'PATCH' || c.path.endsWith('/decision'))), false, 'Uploading never saves or sends');
    await page.getByRole('button', { name: 'Remove Reviewed-attachment-4-with-a-long-filename.txt', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Add attachment', exact: true }).isDisabled(), false);
    await page.evaluate(() => window.draftFixture.loseNext());
    await page.getByRole('button', { name: 'Save and review', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Connection lost' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save and review', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Reload draft', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Email body"]').disabled);
    assert.equal(await page.getByLabel('Email body', { exact: true }).inputValue(), 'Reviewed edited body.');
    assert.equal(await page.evaluate(() => window.draftFixture.calls.filter(c => c.method === 'PATCH').length), 1, 'Reload must not repeat an ambiguous save');
    await page.getByRole('button', { name: 'Cancel edit', exact: true }).click();
    await page.getByRole('button', { name: 'Edit email draft', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Email attachment review', { exact: true }).innerText().then(text => text.includes('Reviewed-attachment-3-with-a-long-filename.txt') && !text.includes('upload-')), true);
    await page.screenshot({ path: `${output}/${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Send once', exact: true }).click();
    await page.getByText('Action completed', { exact: true }).waitFor();
    const mutations = await page.evaluate(() => window.draftFixture.calls.filter(c => c.body));
    const saved = mutations.find(c => c.method === 'PATCH').body;
    assert.equal(saved.connectionId, 'connection-2');
    assert.deepEqual(saved.attachmentIds, ['upload-1', 'upload-2', 'upload-3']);
    assert.equal('attachments' in saved.arguments, false);
    assert.equal(mutations.filter(c => c.path.endsWith('/decision')).length, 1);
    assert.equal(mutations.find(c => c.path.endsWith('/decision')).body.fingerprint, '2'.repeat(64));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    evidence.push({ theme, width, mutations: mutations.length, pass: true }); await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
await writeFile(`${output}/proof.json`, JSON.stringify(evidence, null, 2));
console.log(`Draft UI: ${evidence.length} theme/size scenarios passed; edit locks, uncertain save recovery, refreshed fingerprint, exactly one Send.`);
