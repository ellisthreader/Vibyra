import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const fixture = await serveFixture('tests/conversationResumeBrowserFixture.tsx');
const browser = process.env.VIBYRA_TEST_WEBKIT === '1' ? await webkit.launch() :
  await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['light', 'dark']) for (const mode of ['', 'failure', 'typing-off', 'offline', 'legacy']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(`${fixture.url}/?theme=${theme}&mode=${mode}`);
    const input = page.getByRole('textbox', { name: 'Message computer agent' });
    await input.fill('Continue my saved work');
    const send = page.getByRole('button', { name: 'Send message', exact: true });
    if (['typing-off', 'offline', 'legacy'].includes(mode)) {
      assert.equal(await send.isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Resume terminal' }).count(), 0);
    } else {
      assert.equal(await send.isEnabled(), true);
      await send.click();
      if (mode === 'failure') {
        await page.getByText('Could not restore the saved thread. Your draft is kept.', { exact: true }).waitFor();
        assert.equal(await input.inputValue(), 'Continue my saved work');
      } else {
        await page.getByText('Continue my saved work', { exact: true }).waitFor();
        assert.equal(await input.inputValue(), '');
        assert.equal(await page.getByRole('button', { name: 'Resume terminal' }).count(), 0);
      }
    }
    assert.equal(await page.getByText(/Open a new Codex terminal/).count(), 0);
    await page.close();
  }
  console.log('PASS saved conversation: Send continues, failures retain drafts, offline/typing/legacy gates remain.');
} finally { await browser.close(); fixture.close(); }
