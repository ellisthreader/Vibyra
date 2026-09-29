import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const fixture = await serveFixture('tests/projectLauncherFixture.tsx');
const safari = process.env.VIBYRA_TEST_WEBKIT === '1';
const browser = safari ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const output = '../output/funded-terminals';
await mkdir(output, { recursive: true });
async function enter(page, params) {
  await page.goto(`${fixture.url}/?funded=1&${params}`);
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('button', { name: 'Pocket', exact: true }).click();
  await page.getByTestId('project-terminal-launcher').waitFor();
}
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await enter(page, `theme=${theme}`);
    await page.getByRole('tab', { name: 'Vibyra tokens', exact: true }).click();
    await page.getByRole('tab', { name: 'Vibyra tokens', exact: true }).getByText('40 tokens', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'All models', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Inception', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${theme}${safari ? '-webkit' : ''}.png` });
    await page.getByRole('textbox', { name: 'Search AI models' }).fill('inception/chat-424');
    await page.getByRole('button', { name: 'Inception', exact: true }).click();
    await page.getByRole('tab', { name: 'Your AI accounts', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Vibyra tokens', exact: true }).getByText('40 tokens', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Search AI models' }).fill('inception/chat-424');
    await page.getByRole('radio', { name: 'Chat 424', exact: true }).click();
    await page.getByText('Chat only · this model cannot use computer tools.').waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Full permissions', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
    await page.getByTestId('funded-terminal').waitFor();
    const launches = await page.evaluate(() => window.launcherEvents);
    assert.equal(launches.starts.length, 0, 'token sessions never use the account runner');
    assert.equal(launches.funded.length, 1);
    assert.equal(launches.funded[0].model, 'inception/chat-424');
    assert.equal(launches.funded[0].source, 'vibyra');
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'New terminal in Pocket' }).click();
    await page.getByTestId('project-terminal-launcher').waitFor();
    await page.getByRole('button', { name: 'Back from New terminal', exact: true }).click();
    await page.getByTestId('funded-terminal').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
  await enter(page, 'zero=1&theme=light');
  await page.getByRole('radio', { name: 'Select GPT-6 Sol', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Launch terminal', exact: true }).isEnabled(), true, 'zero tokens do not block own accounts');
  await page.getByRole('tab', { name: 'Vibyra tokens', exact: true }).click();
  await page.getByRole('button', { name: 'Close model picker', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Launch terminal', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Get Vibyra tokens', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Your AI accounts', exact: true }).click();
  await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Session options', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.launcherEvents.funded.length), 0);
  assert.equal(await page.evaluate(() => window.launcherEvents.starts.length), 1);
  // A pre-rollout server/Host still exposes the entire public company catalogue.
  await page.route('https://openrouter.ai/api/v1/models', route => route.fulfill({ json: { data: Array.from({ length: 458 }, (_, i) => ({
    id: `company-${i % 63}/model-${i}`, name: `Model ${i}`, architecture: { output_modalities: ['text'] }, supported_parameters: ['tools'],
  })) } }));
  await page.goto(`${fixture.url}/?theme=light`);
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('button', { name: 'Pocket', exact: true }).click();
  await page.getByRole('tab', { name: 'Vibyra tokens', exact: true }).click();
  await page.getByText('458 models · 63 companies', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search AI models' }).fill('model-457');
  await page.getByRole('button', { name: 'Company 16', exact: true }).click();
  await page.getByRole('radio', { name: 'Model 457', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Launch terminal', exact: true }).isDisabled(), true, 'public catalogue cannot authorize spending');
  await page.getByRole('tab', { name: 'Your AI accounts', exact: true }).click();
  await page.getByRole('radio', { name: 'Select GPT-6 Sol', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Launch terminal', exact: true }).isEnabled(), true);
  assert.equal(await page.getByText('0 Vibyra tokens', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'More models', exact: true }).click();
  const connect = page.getByRole('link', { name: 'Connect AI accounts in Settings, Accounts' });
  await connect.waitFor();
  const linkBox = await connect.boundingBox();
  assert.ok(linkBox.y >= 0 && linkBox.y + linkBox.height <= 667, 'connection link stays visible below the scrolling list');
  await connect.click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
  await page.getByText('Terminal accounts', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.launcherEvents.starts.length + window.launcherEvents.funded.length), 0, 'connection guidance never starts paid work');
  console.log('Funded terminals: source separation, full catalogue, chat-only, direct navigation, back and zero balance passed.');
} finally { await browser.close(); await fixture.close(); }
