// Real settings UI and stores, with native operations answered by the fixture.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';

const useWebKit = process.argv.includes('--webkit');
const output = resolve(`../output/settings-redesign${useWebKit ? '-webkit' : ''}`);
await mkdir(output, { recursive: true });
const entry = await readFile('src/main.tsx', 'utf8');
const styles = [...entry.matchAll(/import "(\.\/styles\/[^"\n]+\.css)";/g)]
  .map(([, path]) => `import ${JSON.stringify(resolve('src', path))};`).join('\n');
const bundle = await build({
  stdin: { contents: `${styles}\nimport './tests/settingsDesignFixture.tsx';`, resolveDir: process.cwd() },
  bundle: true, write: false, outfile: '/tmp/settings-design.js', format: 'iife', jsx: 'automatic',
  define: { global: 'window' },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  plugins: [{ name: 'fixture-art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
const html = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>';
await Promise.all([writeFile(`${output}/app.js`, js), writeFile(`${output}/style.css`, css), writeFile(`${output}/index.html`, html)]);
const server = createServer((req, res) => {
  const isJs = req.url === '/app.js', isCss = req.url === '/style.css';
  res.setHeader('Content-Type', isJs ? 'text/javascript' : isCss ? 'text/css' : 'text/html');
  res.end(isJs ? js : isCss ? css : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = useWebKit ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true });
const evidence = [];
const inspectLayout = async page => {
  const result = await page.evaluate(() => {
    const body = document.querySelector('.settings-pane__body');
    const controls = [...body.querySelectorAll('.setting-row__control')];
    const clipping = controls.filter(control => control.scrollWidth > control.clientWidth + 2).map(control => control.textContent);
    const groups = [...body.querySelectorAll('.settings-block')];
    const gaps = groups.slice(1).map((group, i) => group.getBoundingClientRect().top - groups[i].getBoundingClientRect().bottom);
    return { overflow: body.scrollWidth > body.clientWidth + 2, clipping, gaps };
  });
  assert.equal(result.overflow, false, 'The content pane must not scroll sideways');
  assert.deepEqual(result.clipping, [], 'Controls must not be clipped');
  assert.ok(result.gaps.every(gap => gap >= 24), `Sections must breathe: ${result.gaps}`);
};

try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme === 'light' ? 'light' : ''}`);
    await page.getByRole('dialog', { name: 'Settings' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await inspectLayout(page);
    await page.screenshot({ path: `${output}/general-${theme}.png` });

    await page.getByRole('radio', { name: 'Auto', exact: true }).click();
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, colorScheme);
      assert.equal(await page.evaluate(() => window.settingsDesign.settings().theme), 'auto');
    }
    await page.getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).click();

    await page.getByRole('radio', { name: 'Chat', exact: true }).click();
    await page.getByRole('button', { name: 'Increase Terminal text size' }).click();
    await page.getByRole('radio', { name: 'Best performance', exact: true }).click();
    await page.getByRole('button', { name: 'Privacy & data', exact: true }).click();
    await page.getByRole('switch', { name: 'Restore terminal output' }).click();
    await page.evaluate(() => window.settingsDesign.reload());
    const saved = await page.evaluate(() => window.settingsDesign.settings());
    assert.equal(saved.agentView, 'chat'); assert.equal(saved.fontSize, 14);
    assert.equal(saved.performanceMode, 'best'); assert.equal(saved.persistTerminalScrollback, false);
    await page.getByRole('button', { name: 'Clear saved workspace' }).click();
    assert.equal(await page.evaluate(() => window.settingsDesign.calls.some(call => call.command === 'clear_terminal_session')), false);
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await page.screenshot({ path: `${output}/privacy-${theme}.png` });

    // Search must still navigate to and reveal the exact setting.
    const search = page.getByRole('searchbox', { name: 'Find a setting' });
    await search.fill('remote access security');
    await page.locator('.settings-find__hit').first().click();
    await page.getByRole('heading', { name: 'Security', exact: true }).waitFor();
    await page.getByText('Online', { exact: true }).waitFor();
    await inspectLayout(page);
    assert.equal(await page.locator('.security-activity__item').count(), 3);
    await page.screenshot({ path: `${output}/security-${theme}.png` });
    await page.getByRole('button', { name: 'Show 4 more events' }).click();
    assert.equal(await page.locator('.security-activity__item').count(), 7);
    await page.getByRole('button', { name: 'Show less' }).click();
    await page.getByRole('combobox', { name: 'Remote access mode' }).selectOption('ask');
    const mode = await page.evaluate(() => window.settingsDesign.calls.find(call => call.command === 'remote_security_set_mode'));
    assert.deepEqual(mode.payload, { scope: { accountScope: 'settings-design', hostId: 'mac-fixture' }, mode: 'ask' });
    await page.getByText('Removing a passkey disconnects active remote sessions.').waitFor();
    await page.getByRole('button', { name: 'Remove passkey' }).click();
    await page.getByText('No passkeys yet', { exact: true }).waitFor();
    const revoke = await page.evaluate(() => window.settingsDesign.calls.find(call => call.command === 'remote_security_revoke'));
    assert.deepEqual(revoke.payload, { scope: mode.payload.scope, kind: 'passkey', id: '1', target: null });

    for (const section of ['general', 'privacy', 'help', 'security', 'notifications', 'shortcuts', 'advanced']) {
      await page.evaluate(section => window.settingsDesign.open(section), section);
      await page.setViewportSize({ width: 960, height: 600 });
      await inspectLayout(page);
      await page.screenshot({ path: `${output}/${section}-compact-${theme}.png` });
      await page.locator('.settings-pane__body').evaluate(body => { body.scrollTop = body.scrollHeight; });
      const bottom = await page.locator('.settings-pane__body').evaluate(body => {
        const last = body.lastElementChild.getBoundingClientRect();
        return last.bottom <= body.getBoundingClientRect().bottom + 1;
      });
      assert.ok(bottom, `${section}: the last content must be reachable`);
    }
    await page.getByRole('button', { name: /Voice and speech/ }).click();
    await page.getByRole('combobox', { name: 'Spoken voice', exact: true }).waitFor();
    await inspectLayout(page);
    await page.screenshot({ path: `${output}/advanced-expanded-${theme}.png` });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'Settings' }).count(), 0);
    assert.deepEqual(errors, []);
    evidence.push(`${theme}: Auto theme, persisted choices, clear cancellation, search, remote mode/passkey IPC, activity expansion, seven compact pages, keyboard close`);
    await page.close();
  }
  await writeFile(`${output}/verification.json`, JSON.stringify({ evidence, native: 'Mocked; no account or device was changed.' }, null, 2));
  console.log(`PASS\n${evidence.join('\n')}\nScreenshots: ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
