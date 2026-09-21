import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';

const out = '/tmp/vibyra-chat-account-layout'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/chatAccountLayoutFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/?theme=${theme}`);
    const model = page.getByRole('button', { name: 'Choose AI model', exact: true });
    const besideModel = async locator => {
      await locator.waitFor();
      const [m, e] = await Promise.all([model.boundingBox(), locator.boundingBox()]);
      assert.ok(Math.abs(e.y + e.height / 2 - m.y - m.height / 2) < 2, 'Effort shares the model row');
      assert.ok(e.x >= m.x + m.width, 'Effort follows the model without overlap');
      assert.ok(e.x >= 0 && e.x + e.width <= 375, 'Effort fits a compact iPhone');
      assert.ok(e.y + e.height <= (await page.viewportSize()).height, 'Effort remains visible');
    };
    await page.waitForFunction(() => window.accountChat?.ready);
    await besideModel(page.getByRole('button', { name: 'Thinking effort, Auto, chosen automatically', exact: true }));
    await capture(page, `${out}/${theme}-guest.png`);
    await page.getByRole('button', { name: 'Sign in test account', exact: true }).click();
    await page.waitForFunction(() => window.accountChat?.ready && window.accountChat.store.state.wallet?.guest === false);
    const high = page.getByRole('button', { name: 'Thinking effort, High', exact: true });
    await besideModel(high); await capture(page, `${out}/${theme}-signed-in.png`);
    await high.click();
    const slider = page.getByRole('slider', { name: 'Thinking effort', exact: true });
    await slider.waitFor();
    const track = await slider.boundingBox();
    await page.mouse.move(track.x + track.width - 13, track.y + track.height / 2); await page.mouse.down();
    await page.mouse.move(track.x + 13, track.y + track.height / 2, { steps: 12 }); await page.mouse.up();
    await page.getByRole('button', { name: 'Done setting thinking effort', exact: true }).click();
    await besideModel(page.getByRole('button', { name: 'Thinking effort, Low', exact: true }));
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Check my signed-in chat');
    await page.getByText('This reply uses up to 1 Vibe', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.waitForFunction(() => window.accountChat.sent.length === 1);
    const [sent] = await page.evaluate(() => window.accountChat.sent);
    assert.equal(sent.signedIn, true); assert.equal(sent.model, 'openai/gpt-5.6-luna'); assert.equal(sent.effort, 'low');
    await page.evaluate(() => window.accountChat.store.setModel('qwen/qwen3.8-flash'));
    const fixed = page.getByLabel('Thinking effort is fixed by this model', { exact: true });
    await besideModel(fixed); assert.equal(await page.getByRole('button', { name: /^Thinking effort,/ }).count(), 0);
    await capture(page, `${out}/${theme}-fixed.png`);
    await page.setViewportSize({ width: 375, height: 430 }); await besideModel(fixed);
    const send = await page.getByRole('button', { name: 'Send message', exact: true }).boundingBox();
    assert.ok(send.y + send.height <= 430, 'Send remains visible with keyboard-sized space');
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(`PASS: guest → signed-in layout, saved effort, signed-in send payload, fixed model and keyboard space in both themes. ${out}`);
} finally { await browser.close(); close(); }
