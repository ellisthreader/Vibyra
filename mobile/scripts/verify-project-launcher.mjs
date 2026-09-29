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
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(`${fixture.url}/?existing=1`);
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'New terminal in Pocket' }).click();
    await page.getByTestId('project-terminal-launcher').waitFor();
    await page.getByRole('heading', { name: 'New terminal', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Open navigation menu' }).count(), 0, 'the launcher uses Back');
    assert.equal(await page.getByRole('button', { name: 'Live Preview' }).count(), 0, 'the launcher has no preview action');
    assert.equal(await page.getByRole('button', { name: 'Code' }).count(), 0, 'the launcher has no mode switch');
    assert.equal(await page.getByRole('button', { name: 'Agents' }).count(), 0, 'the launcher has no mode switch');
    assert.equal(await page.getByRole('button', { name: 'Close New terminal' }).count(), 0, 'the sidebar opens the page rather than the old sheet');
    assert.equal(await page.getByRole('button', { name: 'Session options' }).count(), 0, 'the previous terminal is no longer focused');
    await page.getByRole('button', { name: 'Back from New terminal' }).click();
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    assert.equal(await page.getByTestId('project-terminal-launcher').count(), 0, 'Back restores the previous terminal');
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'New terminal in Pocket' }).click();
    await page.getByTestId('project-terminal-launcher').waitFor();
    await page.getByRole('radio', { name: 'Select plain terminal' }).click();
    await page.getByRole('button', { name: 'Launch terminal' }).click();
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    assert.equal(await page.getByTestId('project-terminal-launcher').count(), 0, 'launch opens the new terminal directly');
    assert.deepEqual(await page.evaluate(() => window.launcherEvents.starts), [
      ['fixture-project', 'shell', 'Plain terminal', { safeMode: false }],
    ]);
    await page.close();
  }
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
    assert.equal(await page.getByRole('radio', { name: /Vibyra Auto/ }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.launcherEvents.starts), []);
    const launch = page.getByRole('button', { name: 'Launch terminal', exact: true });
    const box = await launch.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= height, 'launch remains visible on compact phones');
    assert.equal(await page.getByTestId('project-terminal-launcher').evaluate(el => el.scrollWidth > el.clientWidth), false);
    await page.screenshot({ path: `${out}/${theme}-${width}${useWebkit ? '-webkit' : ''}.png` });
    assert.equal(await page.getByRole('radio', { name: 'Standard permissions', exact: true }).count(), 1, 'permissions are visible without opening More options');
    await page.getByRole('button', { name: 'More models', exact: true }).click();
    await page.getByRole('heading', { name: 'Choose company', exact: true }).waitFor();
    assert.equal(await launch.count(), 0, 'the picker hides the launch footer');
    assert.equal(await page.getByRole('button', { name: 'More options', exact: true }).count(), 0, 'the picker hides setup options');
    assert.equal(await page.getByRole('heading', { name: 'New terminal', exact: true }).count(), 1, 'the page title stays in the header');
    assert.equal(await page.getByRole('button', { name: 'Next companies', exact: true }).count(), 0, 'page picker uses a full scrolling list');
    assert.equal(await page.getByRole('button', { name: 'Qwen', exact: true }).count(), 1);
    const pickerBox = await page.getByRole('region', { name: 'Choose your AI' }).boundingBox();
    const fundingBox = await page.getByTestId('terminal-funding').boundingBox();
    assert.ok(pickerBox.height + fundingBox.height > height * 0.65, 'funding choice and picker fill the phone body');
    assert.ok(pickerBox.y >= fundingBox.y + fundingBox.height - 1, 'billing choices stay above the model list');
    await page.screenshot({ path: `${out}/picker-${theme}-${width}${useWebkit ? '-webkit' : ''}.png` });
    await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
    assert.equal(await page.getByRole('radio').count(), 11, 'all computer OpenAI models are in the list');
    await page.getByRole('radio', { name: 'GPT-5 Codex', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole('radio', { name: 'GPT-5 Codex', exact: true }).isVisible(), true);
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
    await page.screenshot({ path: `${out}/simple-options-${theme}-${width}${useWebkit ? '-webkit' : ''}.png` });
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
      if (['fail', 'legacy-permissions'].includes(mode)) await page.getByRole('radio', { name: 'Select GPT-6 Sol', exact: true }).click();
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
  for (const [company, model, kind] of [['Google', 'Gemini 3.5 Flash', 'gemini'], ['xAI', 'Grok 4.6', 'opencode']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(fixture.url); await enter(page);
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.getByRole('radio', { name: 'Full permissions', exact: true }).click();
    await page.getByRole('textbox', { name: 'Session name' }).fill('Provider work');
    await page.getByRole('button', { name: 'More models', exact: true }).click();
    assert.equal(await page.getByRole('switch', { name: 'Safe mode', exact: true }).count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Session name' }).count(), 0);
    await page.getByRole('button', { name: 'DeepSeek', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Qwen', exact: true }).waitFor();
    await page.getByRole('button', { name: company, exact: true }).click();
    await page.getByRole('radio', { name: model, exact: true }).click();
    await page.getByRole('radio', { name: `Select ${model}`, exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Session name' }).inputValue(), 'Provider work');
    assert.equal(await page.getByRole('radio', { name: 'Full permissions', exact: true }).isDisabled(), kind === 'opencode');
    assert.deepEqual(await page.evaluate(() => window.launcherEvents.starts), []);
    await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
    const [start] = await page.evaluate(() => window.launcherEvents.starts);
    assert.equal(start[1], kind);
    assert.equal(start[2], 'Provider work');
    assert.equal(start[3].permissionMode, kind === 'opencode' ? 'standard' : 'full');
    assert.equal(start[3].model, kind === 'gemini' ? 'google/gemini-3.5-flash' : 'x-ai/grok-4.6');
    await page.getByRole('button', { name: 'Session options' }).waitFor();
    await page.close();
  }
  const legacy = await browser.newPage(); await legacy.goto(`${fixture.url}/?legacy-runners=1`); await enter(legacy);
  await legacy.getByRole('button', { name: 'More models', exact: true }).click();
  assert.equal(await legacy.getByRole('button', { name: 'Google', exact: true }).count(), 0);
  await legacy.close();
  console.log('PASS project launcher: isolated picker, expanded connected company list, exact runner/permission routing and compact layouts.');
} finally { await browser.close(); fixture.close(); }
