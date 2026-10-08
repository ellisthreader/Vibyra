import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

/**
 * Settings > Local MCP servers at the real window width (1280), both themes, against an in-memory Mac and account
 * (`desktop-tauri/tests/localMcpFixture.tsx`). Screenshots land in ../output/desktop-local-mcp. No process is started.
 */
const out = resolve('../output/desktop-local-mcp'); await mkdir(out, { recursive: true });
const bundle = await build({ entryPoints: ['../desktop-tauri/tests/localMcpFixture.tsx'], bundle: true, write: false, outfile: '/tmp/local-mcp.js', format: 'iife', jsx: 'automatic',
  loader: { '.webp': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' } });
const server = createServer((req, res) => {
  const file = bundle.outputFiles.find(f => (req.url === '/fixture.js' ? f.path.endsWith('.js') : req.url === '/fixture.css' ? f.path.endsWith('.css') : false));
  res.setHeader('Content-Type', file ? (req.url.endsWith('.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes('--serve')) { console.log(`Fixture: ${url}`); await new Promise(() => {}); }
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', () => errors.push('native dialog'));
    const button = name => page.getByRole('button', { name, exact: true }), text = (t, exact = true) => page.getByText(t, { exact });
    const calls = () => page.evaluate(() => window.fixture.calls);
    await page.goto(`${url}/?${theme}`);
    await text('No local servers yet.').waitFor();
    await button('Add a local server').click();
    assert.equal(await page.locator('[aria-label="Starter servers"] .hub-provider').count(), 6, 'five starters and your own command');
    await page.screenshot({ path: `${out}/${theme}-presets.png` });
    await button('Add Files in a folder').click();
    const dialog = page.getByRole('dialog', { name: 'Add a local MCP server' });
    await dialog.waitFor();
    assert.equal(await button('Add server').isDisabled(), true, 'nothing to add before a folder and consent');
    await button('Choose…').click();
    await dialog.locator('code').filter({ hasText: '@modelcontextprotocol/server-filesystem@2026.8.31 /Users/you/Projects/site' }).waitFor();
    await dialog.getByRole('textbox', { name: 'Server name' }).fill('Project files');
    await button('Add a variable').click();
    await dialog.getByRole('textbox', { name: 'Variable 1 name' }).fill('API_TOKEN');
    await dialog.getByRole('textbox', { name: 'Variable 1 value' }).fill('sekret-123');
    await dialog.getByRole('checkbox', { name: 'Variable 1 is a secret' }).check();
    await text('Working folder: /Users/you/Projects/site').waitFor();
    assert.match(await dialog.getByLabel('What will run').innerText(), /plus API_TOKEN/, 'variable NAMES are shown');
    assert.doesNotMatch(await dialog.innerText(), /sekret-123/, 'the typed secret is never shown as text');
    assert.equal(await dialog.getByText('isn’t pinned to a version', { exact: false }).count(), 0, 'a pinned starter has no launcher warning');
    await page.screenshot({ path: `${out}/${theme}-consent.png` });
    await dialog.getByRole('checkbox', { name: /I understand this runs on my Mac/ }).check();
    await button('Add server').click();
    await dialog.waitFor({ state: 'detached' });
    await page.locator('.local-mcp-server').getByText('Project files', { exact: true }).waitFor();
    const log = await calls();
    const save = log.find(c => c.cmd === 'local_mcp_save');
    assert.deepEqual(save.spec.secretEnv, ['API_TOKEN']); assert.deepEqual(save.secrets, { API_TOKEN: 'sekret-123' }); assert.equal(JSON.stringify(save.spec).includes('sekret-123'), false, 'the definition carries no secret value');
    assert.ok(log.some(c => c.cmd === 'local_mcp_connect'), 'tools are listed and registered after saving');
    await page.getByRole('checkbox', { name: 'Treat Read text file as a read' }).check();
    assert.deepEqual((await calls()).findLast(c => c.cmd === 'reads').tools, ['lmcp_deadbeef__read_text_file']);
    assert.equal(await page.getByRole('checkbox', { name: 'Treat Write file as a read' }).count(), 0, 'a tool the server does not mark read-only has no Read toggle');
    await page.screenshot({ path: `${out}/${theme}-added.png`, fullPage: true });
    // Your own command: an unpinned launcher is warned about.
    await button('Add a local server').click(); await button('Add your own command').click();
    await page.getByRole('textbox', { name: 'Command' }).fill('npx');
    await page.getByRole('textbox', { name: 'Arguments' }).fill('-y\nsome-mcp-server');
    await text('isn’t pinned to a version', false).waitFor();
    await page.getByRole('textbox', { name: 'Arguments' }).fill('-y\nsome-mcp-server@1.2.3');
    await text('isn’t pinned to a version', false).waitFor({ state: 'detached' });
    await button('Cancel').click();
    assert.deepEqual(errors, []); await page.close();

    const seeded = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }), seededErrors = [];
    seeded.on('pageerror', e => seededErrors.push(e.message));
    await seeded.goto(`${url}/?${theme}&seed`);
    for (const chip of ['Running', 'Switched off', 'Stopped after repeated errors', 'Not on your account yet']) await seeded.getByText(chip, { exact: true }).waitFor();
    await seeded.getByText('Read · runs without asking', { exact: false }).waitFor();
    await seeded.screenshot({ path: `${out}/${theme}-status.png`, fullPage: true });
    await seeded.evaluate(() => window.fixture.changeTools());
    await seeded.getByText('Tools changed — review', { exact: true }).waitFor();
    await seeded.getByText('New · Delete all', { exact: false }).waitFor();
    await seeded.locator('.hub-review').screenshot({ path: `${out}/${theme}-review.png` });
    await seeded.getByRole('button', { name: 'Approve tool list for Project files' }).click();
    await seeded.locator('.hub-review').waitFor({ state: 'detached' });
    await seeded.getByRole('button', { name: 'Turn on Notes database' }).click();
    await seeded.getByRole('button', { name: 'Turn off Notes database' }).waitFor();
    await seeded.getByRole('button', { name: 'Try Broken server again' }).click();
    await seeded.getByText('Starts when a teammate needs it', { exact: true }).first().waitFor();
    await seeded.getByRole('button', { name: 'Remove Broken server' }).click();
    await seeded.getByRole('alert').filter({ hasText: 'Remove Broken server?' }).waitFor();
    await seeded.getByRole('button', { name: 'Confirm remove Broken server' }).click();
    await seeded.locator('.local-mcp-server').filter({ hasText: 'Broken server' }).waitFor({ state: 'detached' });
    assert.deepEqual(seededErrors, []); await seeded.close();

    const off = await browser.newPage({ viewport: { width: 1280, height: 600 } });
    await off.goto(`${url}/?${theme}&off`);
    await off.getByText('Local servers aren’t switched on for your account yet.', { exact: true }).waitFor();
    assert.equal(await off.getByRole('button', { name: 'Add a local server', exact: true }).count(), 0, 'no add flow while the flag is off');
    await off.close();
  }
  console.log('PASS desktop local MCP: presets, consent (exact command, variable names, no secret shown), pinned vs unpinned launcher, save + register, read toggles only for read-only tools, status chips, tools-changed review and approve, turn off/on, retry, remove, flag off; dark and light at 1280px.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
