// Real right-sidebar components and production CSS; native commands remain mocked.
// Run from mobile/, optionally with VIBYRA_TEST_WEBKIT=1.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const desktop = resolve(root, 'desktop-tauri'), output = resolve(root, 'output/ai-sidebar');
await mkdir(output, { recursive: true });
const main = await readFile(`${desktop}/src/main.tsx`, 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+\.css)"/g)]
  .map(match => `import '${resolve(desktop, 'src', match[1])}';`).join('\n');
const bundle = await build({
  stdin: { contents: `import '@fontsource-variable/inter';\nimport '@xterm/xterm/css/xterm.css';\n${styles}\nimport '${desktop}/tests/workspaceToolsFixture.tsx';`, resolveDir: desktop, loader: 'tsx' },
  bundle: true, write: false, outfile: '/tmp/ai-sidebar.js', format: 'iife', jsx: 'automatic',
  loader: { '.woff2': 'dataurl', '.ttf': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.jpg': 'dataurl', '.mp4': 'dataurl', '.svg': 'dataurl' },
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl=()=>null;', loader: 'ts' })); } }],
});
const server = createServer((req, res) => {
  const file = bundle.outputFiles.find(f => req.url === '/fixture.js' ? f.path.endsWith('.js') : req.url === '/fixture.css' ? f.path.endsWith('.css') : false);
  res.setHeader('Content-Type', file ? (req.url.endsWith('.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const engine = process.env.VIBYRA_TEST_WEBKIT === '1' ? 'WebKit' : 'Chromium';
const browser = engine === 'WebKit' ? await webkit.launch({ headless: true }) : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?real-workspace&navigation&slow-chat&theme=${theme}`);
    const field = page.getByRole('textbox', { name: 'Message Vibyra' });
    const chat = page.locator('.chat-scroll');
    const resize = page.getByRole('separator', { name: 'Resize project companion' });
    await field.waitFor();
    await page.locator('[data-pane-id="-1"]').waitFor();
    await page.evaluate(() => { window.savedTerminal = document.querySelector('[data-pane-id="-1"]'); window.savedComposer = document.querySelector('.chat-input__area'); });
    const flush = () => page.waitForFunction(() => Math.abs(document.querySelector('#project-terminal-panel').getBoundingClientRect().right - document.querySelector('#project-companion').getBoundingClientRect().left) < 2);
    await flush();
    const handle = await resize.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
    await page.mouse.down(); await page.mouse.move(handle.x - 90, handle.y + 200, { steps: 6 });
    await page.waitForFunction(() => document.querySelector('#project-companion').getBoundingClientRect().width > 450);
    await flush(); // Must align during the drag, before pointerup commits the preference.
    await page.mouse.up();
    await resize.focus(); await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('#project-companion').getBoundingClientRect().width === 320);
    await flush();
    const draft = 'Review the checkout flow and explain the next steps.\nKeep the current changes.\nCheck the desktop experience.\nThen review the results.\nDo not send this draft yet.';
    await field.fill(draft);
    await page.waitForFunction(() => document.querySelector('.chat-input__area').clientHeight > 100);
    await field.evaluate(el => el.setSelectionRange(7, 16));
    await page.getByRole('button', { name: 'Open project files' }).click();
    await page.getByRole('button', { name: '← Chat', exact: true }).click();
    assert.equal(await field.inputValue(), draft);
    assert.deepEqual(await field.evaluate(el => [el === window.savedComposer, el.selectionStart, el.selectionEnd]), [true, 7, 16]);
    await page.evaluate(() => window.fixtureProject('garden'));
    assert.equal(await field.inputValue(), '');
    await field.fill('Only for Garden.');
    await page.evaluate(() => window.fixtureProject('studio'));
    await page.waitForFunction(() => document.querySelector('.chat-input__area').clientHeight > 100);
    assert.equal(await field.inputValue(), draft, 'project return restores and measures the multiline draft');
    await page.reload(); await field.waitFor();
    assert.equal(await field.inputValue(), draft, 'draft survives a renderer reload');
    await page.waitForFunction(() => document.querySelector('.chat-input__area').clientHeight > 100);
    await field.fill('');
    await resize.focus(); await page.keyboard.press('End'); await flush();
    await page.evaluate(() => {
      window.savedTerminal = document.querySelector('[data-pane-id="-1"]');
      const turns = Array.from({ length: 28 }, (_, i) => ({ id: `history-${i}`, role: i % 2 ? 'assistant' : 'user', content: `Message ${i + 1}. ${'A considered reply with useful project context. '.repeat(4)}`, status: 'complete', createdAt: i }));
      window.fixtureChat.setState({ threads: { studio: turns } });
    });
    await page.waitForFunction(() => { const el = document.querySelector('.chat-scroll'); return el.scrollHeight - el.scrollTop - el.clientHeight < 3; });
    await chat.evaluate(el => { el.scrollTop = 220; });
    const jump = page.getByRole('button', { name: 'Jump to latest' });
    await jump.waitFor();
    const position = await chat.evaluate(el => el.scrollTop);
    await page.getByRole('button', { name: 'Open project files' }).click();
    await page.evaluate(() => window.fixtureChat.setState(s => ({ threads: { ...s.threads, studio: [...s.threads.studio, { id: 'background', role: 'assistant', content: 'Finished while Files was open.', status: 'complete', createdAt: 50 }] } })));
    await page.getByRole('button', { name: '← Chat', exact: true }).click();
    assert.equal(await chat.evaluate(el => el.scrollTop), position, 'background updates preserve the reader’s place');
    await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();
    await page.getByRole('button', { name: 'Workspace sidebar', exact: true }).click();
    assert.equal(await chat.evaluate(el => el.scrollTop), position);
    await jump.focus(); await page.keyboard.press('Enter');
    await jump.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => { const el = document.querySelector('.chat-scroll'); return el.scrollHeight - el.scrollTop - el.clientHeight < 3; });
    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    await page.getByRole('button', { name: 'Restore sidebar', exact: true }).click();
    assert.equal(await page.evaluate(() => window.savedTerminal === document.querySelector('[data-pane-id="-1"]')), true, 'expanding Chat preserves terminal hosts');
    await page.getByRole('button', { name: 'Conversation options', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#project-companion').isVisible(), true, 'first Escape belongs to the menu');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Conversation options');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'workspace-sidebar-toggle');
    await page.keyboard.press('Enter'); await field.waitFor();
    await page.evaluate(() => window.fixtureChat.getState().clear('studio'));
    await field.fill('IME composition stays in the draft');
    const callsBefore = await page.evaluate(() => window.fixtureCalls.filter(c => c.command === 'ai_chat').length);
    await field.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    await field.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229 });
    assert.equal(await field.inputValue(), 'IME composition stays in the draft');
    assert.equal(await page.evaluate(() => window.fixtureCalls.filter(c => c.command === 'ai_chat').length), callsBefore);
    await field.press('Shift+Enter');
    assert.ok((await field.inputValue()).includes('\n'));
    await field.fill('Please review these changes.'); await field.press('Enter');
    await page.getByRole('button', { name: 'Stop the reply' }).waitFor();
    await page.locator('#companion-tab-worktrees').click();
    assert.equal(await page.locator('#companion-tab-chat .companion__activity').count(), 1);
    await page.waitForFunction(() => window.fixtureChat.getState().active === null);
    await page.locator('#companion-tab-chat').click();
    await page.getByText('The changes are ready for review.', { exact: false }).waitFor();
    assert.equal(await page.locator('#companion-tab-chat .companion__activity').count(), 0);
    await resize.focus(); await page.keyboard.press('Home');
    await page.setViewportSize({ width: 960, height: 600 });
    await field.fill(draft);
    await page.waitForFunction(() => { const el = document.querySelector('.chat-scroll'); return el.scrollHeight - el.scrollTop - el.clientHeight < 3; });
    const box = await page.locator('.chat-input').boundingBox();
    assert.ok(box.y + box.height <= 600 && box.x >= 0 && box.x + box.width <= 960, 'narrow multiline composer stays inside the window');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/chat-${theme}-${engine.toLowerCase()}.png` });
    await page.evaluate(() => {
      window.fixtureChat.setState({ error: 'Studio-only failure', threads: { studio: [{ id: 'failure', role: 'assistant', content: 'Partial reply', status: 'failed', error: 'Studio-only failure', createdAt: 60 }] } });
      window.fixtureProject('garden');
    });
    await field.waitFor();
    assert.equal(await page.getByText('Studio-only failure', { exact: true }).count(), 0, 'errors never leak to another project');
    assert.equal(await field.inputValue(), 'Only for Garden.');
    await page.evaluate(() => window.fixtureProject('studio'));
    await page.getByText('Studio-only failure', { exact: true }).waitFor();
    await page.evaluate(() => window.fixtureChat.getState().clear('studio'));
    await field.fill(''); await page.setViewportSize({ width: 1440, height: 900 });
    await resize.dblclick();
    await page.getByRole('heading', { name: 'What can I help with?' }).waitFor();
    await page.screenshot({ path: `${output}/empty-${theme}-${engine.toLowerCase()}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`PASS ${engine}: live terminal/sidebar alignment, keyboard resize, project and reload draft recovery, Files selection/scroll continuity, hidden updates, latest-reply navigation, terminal identity, Escape focus, IME, background replies, scoped errors, compact layout and both themes (mock IPC).`);
} finally { await browser.close(); server.close(); }
