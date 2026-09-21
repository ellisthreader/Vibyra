import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

// The Remote page for a paired computer: the drawn computer, then its identity
// on the page itself with no panel behind it, and — only while connected — the
// Location row names roughly where it is, from the public address its network
// shares with the phone. Being on the way back is said as such, never as an
// error; and a phone with no computer gets the connect flow, nothing else.
const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-remote'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/remoteFixture.tsx');
const self = 'https://get.geojs.io/v1/ip/geo.json';
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const open = async (theme, search, ready = 'Studio Mac') => {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/?theme=${theme}&${search}`);
    await page.getByText(ready, { exact: true }).waitFor();
    return { page, errors, lookups: () => page.evaluate(() => window.lookups) };
  };
  const location = (page, value) => page.getByText(value, { exact: true }).waitFor();
  for (const theme of ['dark', 'light']) {
    const { page, errors, lookups } = await open(theme, 'geo=ok');
    const identity = await page.getByText('Studio Mac', { exact: true }).evaluate(node => {
      const style = getComputedStyle(node.parentElement);
      return { background: style.backgroundColor, border: style.borderTopWidth };
    });
    assert.deepEqual(identity, { background: 'rgba(0, 0, 0, 0)', border: '0px' },
      'The name, platform and status sit on the page, not on a panel');
    await location(page, 'Connected');
    // Connected, the computer's screen is Vibyra Desktop itself, running.
    await location(page, 'Vibyra');
    await location(page, 'Manchester, United Kingdom');
    assert.deepEqual(await lookups(), [self], 'A computer on this network is placed by the phone’s own public address');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).waitFor();
    await capture(page, `${out}/remote-${theme}.png`);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const cases = [
    ['geo=pending', 'Locating…', [self]],
    ['geo=fail', 'Local network', [self]],
    ['geo=country&address=203.0.113.7:4318', 'United States', ['https://get.geojs.io/v1/ip/geo/203.0.113.7.json']],
    ['address=studio.example.com:4318', 'Outside your network', []],
  ];
  for (const [search, shown, asked] of cases) {
    const { page, errors, lookups } = await open('dark', search);
    await location(page, shown);
    assert.deepEqual(await lookups(), asked, search);
    assert.deepEqual(errors, []);
    await page.close();
  }
  // An IPv6 computer's address reads as an address: no URL brackets, no port,
  // and whole, on its own line, rather than cut short beside its label.
  const ipv6 = '2a00:23ee:1a2b:3c4d:5e6f:7a8b:9c0d:1e2f';
  const six = await open('dark', `address=${encodeURIComponent(`[${ipv6}]:4318`)}`);
  const shown = six.page.getByText(ipv6, { exact: true });
  await shown.waitFor();
  assert.ok(await shown.evaluate(node => node.scrollWidth <= node.clientWidth), 'The IPv6 address is shown whole');
  assert.equal(await six.page.getByText(/[[\]]|:4318/).count(), 0, 'No brackets or port on the page');
  // The iOS Simulator reaches the Mac it runs on at loopback. `::1` names no
  // network, so the page shows that Mac's public IP from the lookup instead.
  const loop = await open('dark', `address=${encodeURIComponent('[::1]:4319')}`);
  await location(loop.page, 'Public IP');
  await location(loop.page, '2001:db8:4a2f:10:6da1:3d15:e37f:100d');
  assert.equal(await loop.page.getByText(/(^|[^:\w])::1\b/).count(), 0, 'Loopback is never shown as the IP');
  await capture(loop.page, `${out}/remote-simulator.png`);
  // Where the computer answers from is only true while it answers.
  const away = await open('dark', 'status=offline');
  await away.page.getByRole('button', { name: 'Reconnect', exact: true }).waitFor();
  await location(away.page, 'Not connected');
  assert.equal(await away.page.getByText('Location', { exact: true }).count(), 0, 'No location while disconnected');
  assert.equal(await away.page.getByText('IP address', { exact: true }).count(), 0, 'No address while disconnected');
  assert.equal(await away.page.getByText('Vibyra', { exact: true }).count(), 0, 'A computer out of reach is not drawn running Vibyra');
  await location(away.page, '0.1.10');
  assert.deepEqual(await away.lookups(), [], 'Nothing is looked up while disconnected');
  await capture(away.page, `${out}/remote-disconnected.png`);
  // The ladder between attempts: the app is acting on the drop, so the page says
  // so and holds the button, rather than naming an error next to "Not connected".
  const back = await open('dark', 'status=offline&reconnecting=1&error=Connection%20closed.%20Reconnect%20to%20catch%20up.');
  await location(back.page, 'Reconnecting…');
  assert.equal(await back.page.getByText('Connection closed', { exact: false }).count(), 0, 'No error while reconnecting');
  assert.equal(await back.page.getByRole('button', { name: 'Reconnect', exact: true }).getAttribute('aria-disabled'), 'true');
  await capture(back.page, `${out}/remote-reconnecting.png`);
  // A Windows desktop keeps its bar along the bottom.
  const windows = await open('light', 'platform=windows&name=Office%20PC', 'Office PC');
  await location(windows.page, 'Connected');
  await capture(windows.page, `${out}/remote-windows.png`);
  // Given up: the reason, and the way back.
  const failed = await open('light', 'status=error&platform=windows&error=Cannot%20reach%20your%20computer.%20Check%20that%20Vibyra%20Host%20is%20running.');
  await location(failed.page, 'Couldn’t reach your computer');
  await location(failed.page, 'Cannot reach your computer. Check that Vibyra Host is running.');
  assert.equal(await failed.page.getByRole('button', { name: 'Reconnect', exact: true }).getAttribute('aria-disabled'), null);
  await capture(failed.page, `${out}/remote-error.png`);
  // No computer yet: the page is the connect flow, from its first step.
  const none = await open('dark', 'host=none', 'I’ve installed it');
  await none.page.getByRole('heading', { name: /Connect your/ }).waitFor();
  assert.equal(await none.page.getByText('Studio Mac', { exact: true }).count(), 0);
  await capture(none.page, `${out}/remote-none.png`);
  console.log(`Remote page verified; screenshots in ${out}`);
} finally {
  await browser?.close();
  close();
}
