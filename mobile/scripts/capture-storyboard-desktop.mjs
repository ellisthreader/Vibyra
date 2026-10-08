// Renders the real desktop frontend (mocked native IPC) with every stylesheet
// main.tsx loads, in order, and captures the storyboard frames at 1440×900.
// Usage (from mobile/): node scripts/capture-storyboard-desktop.mjs [dark|light|both]
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';

const desktop = resolve('../desktop-tauri');
const out = resolve(process.env.VIBYRA_TEST_WEBKIT ? '../output/storyboard-after-webkit' : '../output/storyboard-after'); await mkdir(out, { recursive: true });
const main = await readFile(resolve(desktop, 'src/main.tsx'), 'utf8');
const styles = [...main.matchAll(/^import "((?:\.\/styles\/[^"]+\.css)|(?:@[^"]+))";$/gm)].map(m => m[1]);
const imports = styles.map(s => `import ${JSON.stringify(s.startsWith('./') ? resolve(desktop, 'src', s) : s)};`).join('\n');
const live = `
import { useTerminalStore } from ${JSON.stringify(resolve(desktop, 'src/state/terminalStore.ts'))};
import { useTeammateNeeds } from ${JSON.stringify(resolve(desktop, 'src/state/teammateNeedsStore.ts'))};
import { usePhoneStore } from ${JSON.stringify(resolve(desktop, 'src/state/phoneStore.ts'))};
import { useAgentAttention } from ${JSON.stringify(resolve(desktop, 'src/state/agentAttentionStore.ts'))};
const q = new URLSearchParams(location.search);
if (q.has('live')) setTimeout(() => {
  const state = useTerminalStore.getState();
  const words = ['working', 'attention', 'working', 'idle', 'idle', 'working'];
  useTerminalStore.setState({ panes: state.panes.map((p, i) => ({ ...p, status: i < 3 || i === state.panes.length - 1 ? 'running' : p.status, lastFocusedAt: Date.now() - i * 600000 })),
    activity: Object.fromEntries(state.panes.map((p, i) => [p.id, words[i % words.length]])) });
  // Needs you: one teammate approval and one iPhone asking, beside the waiting terminal.
  useTeammateNeeds.getState().set([{ id: 'n1', title: 'A step needs your approval', createdAt: new Date(Date.now() - 540000).toISOString(), read: false, actionable: true,
    destination: { source: 'agent_run', runId: 'r1', agentId: 'agent-one', kind: 'approval' } }]);
  const phone = usePhoneStore.getState().status;
  // Two more projects need you at once: an approval in vibyra-api, a finish in vibyra-website.
  const run = (state, extra) => ({ state, ask: null, step: null, found: null, steps: 4, commands: 2, startedAt: Date.now() - 300000, finishedAt: null, durationMs: null, ...extra });
  useAgentAttention.setState({ seen: { s1: 0, s2: 0 }, runs: {
    s1: { projectId: 'api', agentId: 'claude', title: 'Claude Opus 5.5', run: run('waiting', { ask: 'Ship the billing webhook', step: { title: 'Allow editing files?', command: null } }) },
    s2: { projectId: 'website', agentId: 'codex', title: 'GPT-6 Astra', run: run('done', { ask: 'Fix the pricing page', found: 'Pricing cards now match the design. 3 files changed.', finishedAt: Date.now() - 240000 }) },
  } });
  usePhoneStore.setState({ status: { enabled: true, discoverable: true, address: '', error: null, devices: [], active: [], ...phone, pending: [{ id: 'a1b2c3d4e5f6a7b8', name: "Barbara's iPhone", lastRoute: 'nearby' }] } });
}, 50);`;
const contents = `${imports}\nimport ${JSON.stringify(resolve(desktop, 'tests/nativeRedesignFixture.tsx'))};\n${live}`;
const bundle = await build({ stdin: { contents, resolveDir: desktop, loader: 'tsx' }, bundle: true, write: false, outdir: '/tmp/sb-capture', format: 'iife', jsx: 'automatic',
  nodePaths: [resolve(desktop, 'node_modules')],
  loader: { '.webp': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl', '.mp4': 'empty', '.jpg': 'dataurl' },
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }] });
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';
const server = createServer(async (req, res) => {
  if (req.url.includes('/assets/teammates/')) { try { res.setHeader('Content-Type', 'image/webp'); res.end(await readFile(resolve(desktop, 'src/assets/teammates', req.url.split('/').at(-1)))); } catch { res.statusCode = 404; res.end(); } return; }
  if (req.url === '/f.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); return; }
  if (req.url === '/f.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end('<meta charset="utf-8"><link rel="stylesheet" href="/f.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/f.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = process.env.VIBYRA_TEST_WEBKIT ? await webkit.launch({ headless: true }) : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const themes = process.argv[2] === 'light' ? ['light'] : process.argv[2] === 'both' ? ['dark', 'light'] : ['dark'];
try {
  for (const theme of themes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?${theme}&tree&live`); await page.locator('.adaptive-pane-host .pane').last().waitFor(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/s2-project-${theme}.png` });
    await page.getByRole('button', { name: 'Workspace sidebar' }).click(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/s2-companion-${theme}.png` });
    await page.getByRole('button', { name: 'Workspace sidebar' }).click(); await page.waitForTimeout(200);
    await page.locator('aside[aria-label="Workspace navigation"]').getByRole('button', { name: 'Home', exact: true }).click(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/s1-home-${theme}.png` });
    await page.locator('aside[aria-label="Workspace navigation"] .frame-nav').getByRole('button', { name: /^Needs you/ }).click();
    await page.locator('.sb-need').first().waitFor(); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/s7-needs-${theme}.png` });
    await page.locator('aside[aria-label="Workspace navigation"]').getByRole('button', { name: 'Home', exact: true }).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Open Vibyra', exact: true }).click(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Expand terminal', exact: true }).first().click(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/s3-focus-${theme}.png` });
    await page.getByRole('tab', { name: 'Agents', exact: true }).click(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/s5-agents-${theme}.png` });
    await page.locator('.teammate-row').first().click(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/s5-teammate-${theme}.png` });
    await page.getByRole('tab', { name: 'Chat', exact: true }).click(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/s5-chat-${theme}.png` });
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/s5-edit-${theme}.png` });
    await page.setViewportSize({ width: 960, height: 640 }); await page.getByRole('tab', { name: 'Code', exact: true }).click(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/narrow-code-${theme}.png` });
    if (errors.length) console.error(theme, 'page errors:', errors);
    await page.close();
  }
  console.log('captured', themes.join(', '), '→', out);
} finally { await browser.close(); server.close(); }
