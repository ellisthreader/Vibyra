import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { chromePath } from './chrome-path.mjs';

const fixture = await serveFixture('tests/conversationModelPickerFixture.tsx');
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?theme=${theme}`);
    const input = page.getByRole('textbox', { name: 'Message computer agent' });
    const button = name => page.getByRole('button', { name, exact: true });
    await input.fill('First prompt');
    await button('Send message').click();
    await input.fill('My next draft while the first prompt sends');
    await page.evaluate(() => window.settleSend());
    await page.waitForFunction(() => !document.querySelector('[aria-label="Send message"]')?.disabled);
    assert.equal(await input.inputValue(), 'My next draft while the first prompt sends');
    assert.equal(await page.evaluate(() => window.pickerReads.filter(method => method === 'conversation.models').length), 1,
      'Typing and parent renders do not refetch account models');
    await input.fill('/effort');
    await button('Send message').click();
    const slider = page.getByRole('slider', { name: 'Thinking effort' });
    await slider.waitFor();
    const bounds = await slider.boundingBox();
    await page.mouse.click(bounds.x + 25, bounds.y + bounds.height / 2);
    await button('Done setting thinking effort').click();
    await page.waitForFunction(() => window.pickerCalls.length === 1);
    assert.equal((await page.evaluate(() => window.pickerCalls))[0].effort, 'low');
    await page.evaluate(() => window.settlePicker(false));
    await page.getByText('Settings changed on the computer', { exact: true }).waitFor();
    await input.fill('/effort');
    await button('Send message').click();
    await slider.waitFor();
    assert.equal(await slider.getAttribute('aria-valuenow'), '2', 'Rejected effort returns to confirmed High');
    await button('Done setting thinking effort').click();
    assert.equal((await page.evaluate(() => window.pickerCalls)).length, 1, 'Unchanged effort makes no write');
    assert.deepEqual(errors, []);
    await page.goto(`${fixture.url}/?theme=${theme}&empty-models=1`);
    await input.fill('/effort');
    await button('Send message').click();
    await page.getByText('Thinking effort is not available for this model right now.', { exact: true }).waitFor();
    await button('Done setting thinking effort').click();
    await input.waitFor();
    assert.deepEqual(errors, [], 'Empty model data must not crash the effort picker');
    await page.goto(`${fixture.url}/?theme=${theme}&mismatch=1`);
    await input.fill('Keep this terminal draft');
    await page.getByText('Waiting for the conversation…', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.pickerReads), [], 'A different terminal cannot supply account models');
    assert.equal(await button('Send message').isDisabled(), true);
    assert.equal(await button('Choose AI model').getByText('Account model 1', { exact: true }).count(), 0);
    await button('Choose AI model').click();
    await page.getByText('Wait for this conversation to load.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.pickerCalls), []);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: draft continuity, stable model reads, refused effort recovery, empty ladder, terminal identity isolation.`);
  }
} finally { await browser.close(); fixture.close(); }
