import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';
import { mkdir } from 'node:fs/promises';

const out = '/tmp/vibyra-chat-recovery'; await mkdir(out, { recursive: true });
const fixture = await serveFixture('tests/chatRecoveryFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    const send = page.getByRole('button', { name: 'Send message', exact: true });
    const ready = () => page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
    const attach = async name => {
      await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
      const [file] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose files', exact: true }).click()]);
      await file.setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('Chat test attachment') });
      await page.getByLabel(`File ${name}, ready`, { exact: true }).waitFor();
    };
    await page.goto(`${fixture.url}/?mode=retry&theme=${theme}`);
    await input.fill('Keep this draft.');
    await page.getByText('Estimate interrupted. Please refresh.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await ready(); assert.equal(await input.inputValue(), 'Keep this draft.');
    console.log(`PASS ${theme}: Refresh retries the failed quote without an edit.`);

    const before = await page.evaluate(() => window.chatTest.quotes.length);
    await page.getByRole('button', { name: 'Test changed memory' }).click();
    await page.waitForFunction(n => window.chatTest.quotes.length > n, before);
    await ready();
    const latest = await page.evaluate(() => window.chatTest.quotes.at(-1));
    assert.ok(latest.personal > 0);
    console.log(`PASS ${theme}: saved preferences invalidate the prepared request.`);

    await attach('first.txt'); await ready();
    await send.click();
    await page.waitForFunction(() => window.chatTest.sent.length === 1);
    await input.fill('This is my NEXT draft.');
    await attach('next.txt');
    await page.evaluate(() => window.chatTest.release());
    await page.getByText('Your reply arrived.', { exact: true }).waitFor();
    await ready();
    assert.equal(await input.inputValue(), 'This is my NEXT draft.');
    assert.equal(await page.getByLabel('File first.txt, ready', { exact: true }).count(), 0);
    await page.getByLabel('File next.txt, ready', { exact: true }).waitFor();
    console.log(`PASS ${theme}: a delayed send keeps the next draft.`);

    await send.click();
    await page.waitForFunction(() => window.chatTest.sent.length === 2);
    await page.getByRole('button', { name: 'Test other chat' }).click();
    await input.fill('A draft in another chat.');
    assert.equal(await page.getByLabel('File next.txt, ready', { exact: true }).count(), 0, 'attachments cannot follow a send into a different chat');
    await page.evaluate(() => window.chatTest.release());
    await ready();
    assert.equal(await input.inputValue(), 'A draft in another chat.');
    assert.equal(await page.getByText('Your reply arrived.', { exact: true }).count(), 0);
    assert.equal((await page.evaluate(() => window.chatTest.quotes.at(-1))).chatId, 'other');
    assert.deepEqual(errors, []);
    await capture(page, `${out}/${theme}.png`);
    await page.close(); console.log(`PASS ${theme}: chat switching cannot reuse an earlier chat's quote or erase its draft.`);
  }
} finally { await browser.close(); fixture.close(); }
