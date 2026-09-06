import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'vibyra-desktop-setup-'));
const desktop = resolve('../desktop-tauri');
const css = ['tokens', 'base', 'base-controls', 'controls', 'modals', 'settings-modal', 'settings-pane', 'settings-rows', 'settings-modal-narrow'];
const files = [];
for (const name of css) {
  try { await readFile(join(desktop, `src/styles/${name}.css`)); files.push(name); } catch { /* Optional split styles. */ }
}
await build({ stdin: { contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsModal } from './src/components/settings/SettingsModal';
import { useSettingsStore } from './src/state/settingsStore';
import { useWorkspaceStore } from './src/state/workspaceStore';
${files.map(name => `import './src/styles/${name}.css';`).join('\n')}
useSettingsStore.setState({settings: {theme:'dark'}});
useWorkspaceStore.setState({settingsOpen:true,settingsSection:'phone'});
createRoot(document.getElementById('root')).render(<SettingsModal />);
`, loader: 'tsx', resolveDir: desktop }, bundle: true, outfile: join(dir, 'app.js'), jsx: 'automatic', banner: { js: 'var __fixtureAssetGlob = () => ({});' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.glob': '__fixtureAssetGlob' } });
await writeFile(join(dir, 'index.html'), '<html data-theme="dark"><link rel="stylesheet" href="/app.css"><div id="root"></div><script>window.calls=[];window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{window.calls.push({cmd,args});return null},transformCallback:()=>1};</script><script src="/app.js"></script></html>');
const server = createServer(async (req, res) => {
  const name = req.url === '/app.js' ? 'app.js' : req.url === '/app.css' ? 'app.css' : 'index.html';
  res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(join(dir, name)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading', { name: 'Phone companion', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Copy setup command' }).isDisabled(), true);
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await nav.getByRole('button', { name: /Phone companion/ }).click();
  assert.match(await nav.getByRole('button', { name: /Phone companion/ }).innerText(), /WIP/);
  await page.getByRole('button', { name: 'Open phone app' }).click();
  await page.getByRole('button', { name: 'Download Host' }).click();
  await page.getByRole('button', { name: 'Full connection guide' }).click();
  await page.getByRole('textbox', { name: 'Host project folder' }).fill('/tmp/My project');
  await page.getByRole('textbox', { name: 'Computer Wi-Fi address' }).fill('192.168.1.20');
  await page.getByRole('button', { name: 'Copy setup command' }).click();
  await page.getByText('Setup command copied.').waitFor();
  const calls = await page.evaluate(() => window.calls);
  assert.deepEqual(calls.filter(call => call.cmd === 'phone_open_resource').map(call => call.args.resource), ['app', 'downloads', 'guide']);
  assert.match(calls.find(call => call.cmd === 'write_clipboard_text').args.text, /--project '\/tmp\/My project'/);
  await page.locator('.settings-pane__body').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/vibyra-onboarding-screenshots/desktop-settings.png' });
  await page.getByRole('combobox', { name: 'Host operating system' }).selectOption('windows');
  await page.getByRole('textbox', { name: 'Host project folder' }).fill('C:\\Projects\\app');
  await page.getByRole('button', { name: 'Copy setup command' }).click();
  assert.match(await page.getByLabel('Host setup command').innerText(), /^& '\.\\Vibyra-Host/);
  await page.evaluate(() => { window.__TAURI_INTERNALS__.invoke = async () => { throw new Error('Browser unavailable'); }; });
  await page.getByRole('button', { name: 'Open phone app' }).click();
  await page.getByRole('alert').filter({ hasText: 'Browser unavailable' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: Desktop Settings route/WIP, real pane Linux/Windows commands, clipboard/resource IPC handoff and action failure. Native browser launch is validated separately.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
