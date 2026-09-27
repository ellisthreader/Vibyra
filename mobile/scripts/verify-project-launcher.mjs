import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const fixture = await serveFixture('tests/projectLauncherFixture.tsx');
const useWebkit = process.env.VIBYRA_TEST_WEBKIT === '1';
const browser = useWebkit ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const out = '../output/project-launcher';
await mkdir(out, { recursive: true });
const enter = async page => {
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('button', { name: 'Pocket', exact: true }).click();
  await page.getByTestId('project-terminal-launcher').waitFor();
};
try {
  for (const theme of ['dark', 'light']) for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?theme=${theme}&slow=1`);
    // Reproduce the original bug with an explicitly selected chat in this same folder.
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'Show sessions in Pocket' }).click();
    await page.getByRole('button', { name: 'Open AI chat Saved project chat' }).click();
    assert.equal(await page.getByTestId('project-terminal-launcher').count(), 0);
    await enter(page);
    await page.getByRole('radio', { name: 'Select GPT-6 Sol', exact: true }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Select GPT-6 Sol', exact: true }).getAttribute('aria-checked'), 'true');
    assert.deepEqual(await page.evaluate(() => window.launcherEvents.starts), []);
    const launch = page.getByRole('button', { name: 'Launch terminal', exact: true });
    const box = await launch.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= height, 'launch remains visible on compact phones');
    assert.equal(await page.getByTestId('project-terminal-launcher').evaluate(el => el.scrollWidth > el.clientWidth), false);
    await page.screenshot({ path: `${out}/${theme}-${width}${useWebkit ? '-webkit' : ''}.png` });
    await page.getByRole('button', { name: 'More models', exact: true }).click();
    await page.getByRole('heading', { name: 'Choose company', exact: true }).waitFor();
    assert.equal(await launch.isDisabled(), true);
    await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
    await page.getByRole('button', { name: 'Search AI models', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search AI models', exact: true }).fill('astra');
    await page.getByRole('radio', { name: 'GPT-6 Astra, new', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.launcherEvents.starts), [], 'selecting a model never launches');
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    assert.equal(await page.getByRole('radio', { name: 'Standard permissions', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByRole('radio', { name: 'Full permissions', exact: true }).click();
    await page.screenshot({ path: `${out}/options-${theme}-${width}${useWebkit ? '-webkit' : ''}.png` });
    const name = page.getByRole('textbox', { name: 'Session name' });
    await name.scrollIntoViewIfNeeded();
    await name.pressSequentially('My new terminal');
    assert.equal(await name.inputValue(), 'My new terminal');
    await page.getByRole('switch', { name: 'Safe mode', exact: true }).click();
    await launch.click();
    assert.deepEqual(await page.evaluate(() => window.launcherEvents.starts), [
      ['fixture-project', 'codex', 'My new terminal', { safeMode: true, model: 'openai/gpt-6-astra', permissionMode: 'full' }],
    ]);
    assert.equal(await launch.isDisabled(), true);
    await page.evaluate(() => window.launcherEvents.finish());
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    assert.equal(await page.getByTestId('project-terminal-launcher').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  for (const mode of ['offline', 'watching', 'old', 'catalogue-error', 'fail', 'legacy-permissions']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(`${fixture.url}/?${mode}=1`); await enter(page);
    if (mode === 'offline') await page.getByRole('button', { name: 'Connect computer', exact: true }).waitFor();
    else if (mode === 'watching') assert.equal(await page.getByRole('button', { name: 'Launch terminal', exact: true }).isDisabled(), true);
    else {
      if (mode === 'legacy-permissions') {
        await page.getByRole('button', { name: 'More options', exact: true }).click();
        assert.equal(await page.getByRole('radio', { name: 'Full permissions', exact: true }).count(), 0);
        await page.getByText('Uses your computer’s settings.', { exact: false }).waitFor();
      }
      if (mode === 'old') await page.getByRole('radio', { name: 'Select Codex', exact: true }).click();
      if (mode === 'catalogue-error') {
        await page.getByText('Models unavailable. Please retry.', { exact: true }).waitFor();
        await page.getByRole('radio', { name: 'Select plain terminal', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
      if (mode === 'fail') {
        await page.getByText('Your computer could not start this terminal.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Launch terminal', exact: true }).isEnabled(), true);
      } else await page.getByRole('button', { name: 'Session options' }).waitFor();
    }
    await page.close();
  }
  console.log('PASS project launcher: saved-chat isolation, exact launch, options, busy/error/legacy/offline gates, both themes and compact layouts.');
} finally { await browser.close(); fixture.close(); }
