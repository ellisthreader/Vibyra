import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './lib/fixtureServer.mjs';
await mkdir('/tmp/vibyra-settings-providers', { recursive: true });
const { server, url } = await serveFixture('/tests/accountsPaneFixture.tsx');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1220, height: 940 } });
    const errors = []; page.on('pageerror', cause => errors.push(cause.message));
    await page.goto(`${url}/fixture?${theme === 'light' ? 'light=1' : ''}`);
    const providers = page.locator('[data-panel="aiProviders"]');
    await providers.getByRole('button', { name: /OpenRouter/ }).click();
    await providers.getByRole('textbox', { name: 'Provider API key' }).fill('fixture-provider-key-1234');
    await providers.getByRole('button', { name: 'Find models', exact: true }).click();
    await providers.getByText('2 models available. Choose a model from the field above.').waitFor();
    await providers.getByLabel('Provider model ID', { exact: true }).fill('fixture-small');
    await providers.getByRole('button', { name: 'Save and use provider' }).click();
    await providers.getByRole('switch', { name: 'Use this AI provider' }).waitFor();
    assert.equal(await providers.getByRole('textbox', { name: 'Provider API key' }).inputValue(), '');
    await providers.getByRole('button', { name: /xAI/ }).click();
    await providers.getByRole('button', { name: 'Find models', exact: true }).click();
    await providers.getByText('Add this provider’s key first.').waitFor();
    await providers.getByRole('button', { name: /OpenRouter/ }).click();
    await providers.getByRole('switch', { name: 'Use this AI provider' }).click();
    assert.equal(await providers.getByRole('switch', { name: 'Use this AI provider' }).getAttribute('aria-checked'), 'false');
    await providers.getByRole('button', { name: 'Remove', exact: true }).click();
    await providers.getByText('Provider key removed.').waitFor();
    await providers.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/vibyra-settings-providers/${theme}.png` });
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS Mac/${theme}: provider discovery, native save/remove, explicit selection and key isolation.`);
  }
} finally { await browser.close(); await server.close(); }
