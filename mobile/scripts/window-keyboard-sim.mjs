// Simulator helpers for verify-window-keyboard-ios.mjs: taps and typing
// through idb (points, not pixels), and opening the native Preview fixture in
// the Vibyra dev build through Metro.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { homedir } from 'node:os';

const IDB = process.env.IDB ?? `${homedir()}/Library/Python/3.9/bin/idb`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function simulator(device) {
  const idb = (...args) => execFileSync(IDB, [...args.slice(0, 2), '--udid', device, ...args.slice(2).map(String)], { stdio: 'pipe' });
  return {
    tap: (x, y) => idb('ui', 'tap', Math.round(x), Math.round(y)),
    text: value => idb('ui', 'text', value),
    describe: () => JSON.parse(idb('ui', 'describe-all').toString()),
    openUrl: url => execFileSync('xcrun', ['simctl', 'openurl', device, url], { stdio: 'pipe' }),
    // Launching with a server URL skips the dev launcher and the "Open in Vibyra?" prompt.
    launch: (bundle, url) => execFileSync('xcrun', ['simctl', 'launch', device, bundle, '--initialUrl', url], { stdio: 'pipe' }),
    terminate: bundle => { try { execFileSync('xcrun', ['simctl', 'terminate', device, bundle], { stdio: 'pipe' }); } catch { /* not running */ } },
    screenshot: path => execFileSync('xcrun', ['simctl', 'io', device, 'screenshot', path], { stdio: 'pipe' }),
  };
}

/** Opens tests/windowKeyboardNativeFixture.tsx in the dev build (like verify-preview-loopback-native). */
export async function openNativeFixture(sim, metro = process.env.VIBYRA_METRO ?? 'http://127.0.0.1:8081') {
  const entry = 'tests/windowKeyboardNativeFixture.tsx';
  const manifest = await fetch(metro, { headers: { 'expo-platform': 'ios' } }).then(response => response.json());
  const bundle = new URL(manifest.launchAsset.url);
  bundle.pathname = `/${entry}.bundle`;
  manifest.launchAsset.url = bundle.toString();
  manifest.extra.expoGo.mainModuleName = entry;
  manifest.extra.expoClient.name = 'Vibyra window keyboard proof';
  manifest.extra.scopeKey = '@anonymous/vibyra-window-keyboard-proof';
  const warm = await fetch(bundle);
  if (warm.status !== 200) throw new Error(`Fixture bundle failed: ${(await warm.text()).slice(0, 2000)}`);
  await warm.arrayBuffer();
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/expo+json', 'expo-protocol-version': '0' });
    response.end(JSON.stringify({ ...manifest, id: randomUUID(), createdAt: new Date().toISOString() }));
  });
  await new Promise(resolve => server.listen(47901, '127.0.0.1', resolve));
  try {
    sim.terminate('app.vibyra.mobile');
    sim.launch('app.vibyra.mobile', 'http://127.0.0.1:47901');
    await sleep(8000);
  } finally { server.close(); }
}

/** The dev client shows its menu on a fresh scope (and iOS may ask to open the app): get past both. */
export async function dismissDevMenu(sim) {
  for (let round = 0; round < 6; round++) {
    const buttons = sim.describe().filter(item => item.type === 'Button');
    const next = buttons.find(item => item.AXLabel === 'Open' || item.AXLabel === 'Continue')
      ?? buttons.find(item => item.AXLabel === 'Close' && item.frame.y > 300);
    if (!next) return;
    sim.tap(next.frame.x + next.frame.width / 2, next.frame.y + next.frame.height / 2);
    await sleep(1500);
  }
}
