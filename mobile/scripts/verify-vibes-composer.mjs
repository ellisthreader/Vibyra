// The phone chat's composer: the box on top; + and the model on the left; the
// effort beside the model, voice and send on the right at the narrowest iPhone.
// The + opens a menu over the composer, and a photo or file picked from it uploads,
// is priced by the quote and goes with the message. Voice input runs against a
// scripted recogniser standing in for the browser's (Apple's own is native-only).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-vibes-composer'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/vibesBrowserFixture.tsx');
// Chrome ships both names now; the app takes the unprefixed one first.
const recogniser = () => {
  window.heard = [];
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    start() {
      window.heard.push('start');
      const say = (text, isFinal) => this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal })] });
      setTimeout(() => say('make the header', false), 60);
      setTimeout(() => say('make the header calmer', true), 160);
    }
    stop() { window.heard.push('stop'); setTimeout(() => this.onend?.(), 20); }
    abort() { this.onend?.(); }
  };
};
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const sketch = await browser.newPage({ viewport: { width: 64, height: 48 } });
  await sketch.setContent('<body style="margin:0;background:#5B7CFA"></body>');
  const photo = await sketch.screenshot(); await sketch.close();
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(recogniser);
    await page.goto(`${url}/?theme=${theme}`);
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
    const button = name => page.getByRole('button', { name, exact: true });
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });

    const row = ['Add to chat', 'Choose AI model', 'Speak your message', 'Send message'];
    const boxes = await Promise.all(row.map(name => button(name).boundingBox()));
    const field = await input.boundingBox();
    boxes.forEach((box, i) => {
      assert.ok(box && box.x >= 0 && box.x + box.width <= 375, `${row[i]} fits the narrowest iPhone`);
      if (i !== 1) assert.ok(Math.abs(box.y + box.height / 2 - (boxes[0].y + boxes[0].height / 2)) < 6, `${row[i]} aligns with the other tools`);
      assert.ok(box.y >= field.y + field.height - 1, `${row[i]} sits below the message box`);
      if (i) assert.ok(box.x > boxes[i - 1].x, `${row[i]} comes after ${row[i - 1]}`);
    });
    const effort = await button('Thinking effort, Auto, chosen automatically').boundingBox();
    assert.ok(Math.abs(effort.y + effort.height / 2 - boxes[1].y - boxes[1].height / 2) < 2, 'Effort shares the toolbar row');
    assert.ok(effort.x >= boxes[1].x + boxes[1].width && effort.x + effort.width <= boxes[2].x, 'Effort fits between model and voice');
    await capture(page, `${out}/${theme}-composer.png`);

    // Speaking adds to what was typed, the guess firming up in place.
    await input.fill('Build a timer');
    await button('Speak your message').click();
    await button('Stop voice input').waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Message Vibyra AI"]').value === 'Build a timer make the header calmer');
    await button('Stop voice input').click();
    await button('Speak your message').waitFor();
    assert.deepEqual(await page.evaluate(() => window.heard), ['start', 'stop']);

    // The + opens a menu over the composer: camera, photos and files, then projects.
    await button('Add to chat').click();
    const menu = page.getByRole('menu', { name: 'Add to chat' });
    await menu.waitFor();
    for (const name of ['Take a photo', 'Choose photos', 'Choose files', 'Attach a project']) await menu.getByRole('button', { name, exact: true }).waitFor();
    await capture(page, `${out}/${theme}-menu.png`);
    // A photo from the library uploads, shows in the box and is priced with the words.
    const [photos] = await Promise.all([page.waitForEvent('filechooser'), menu.getByRole('button', { name: 'Choose photos', exact: true }).click()]);
    await photos.setFiles({ name: 'header.png', mimeType: 'image/png', buffer: photo });
    await page.getByLabel('Photo header.jpg, ready', { exact: true }).waitFor();
    await button('Add to chat').click();
    const [files] = await Promise.all([page.waitForEvent('filechooser'), menu.getByRole('button', { name: 'Choose files', exact: true }).click()]);
    await files.setFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Plan\n') });
    await page.getByLabel('File notes.md, ready', { exact: true }).waitFor();
    await page.waitForFunction(() => window.vibesQuoted.some(ids => ids.length === 2));
    await capture(page, `${out}/${theme}-attached.png`);
    await button('Choose AI model').click();
    const picker = page.getByRole('region', { name: 'Choose your AI' });
    await picker.getByRole('button', { name: 'OpenAI', exact: true }).click();
    await picker.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).click();
    await page.getByLabel('Photo header.jpg, ready', { exact: true }).waitFor();
    await page.getByLabel('File notes.md, ready', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), 'Build a timer make the header calmer', 'Model selection retains dictation and attachments');
    // This fixture model deliberately lacks vision; the picker must preserve the
    // photos and let the existing guard refuse sending, then recover via Auto.
    await page.getByText('GPT-5.6 Luna can’t see photos. Choose Auto or a model that can.', { exact: true }).waitFor();
    await button('Choose AI model').click();
    await picker.getByRole('radio', { name: 'Auto', exact: true }).click();
    await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
    await button('Send message').click();
    // Sent, the photo shows in the transcript and the box is empty again.
    await page.getByLabel('Photo header.jpg', { exact: true }).waitFor();
    await page.getByLabel('File notes.md', { exact: true }).waitFor();
    assert.equal(await page.getByLabel(/, ready$/).count(), 0, 'The tray empties once the message is sent');
    await capture(page, `${out}/${theme}-sent.png`);
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Without any recogniser the button explains itself instead of doing nothing.
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await page.addInitScript(() => { window.SpeechRecognition = window.webkitSpeechRecognition = undefined; });
  await page.goto(url); await page.getByRole('textbox', { name: 'Message Vibyra AI' }).waitFor();
  await page.getByRole('button', { name: 'Speak your message', exact: true }).click();
  await page.getByText('Voice input is not available in this browser.', { exact: true }).waitFor();
  await page.close();
  console.log(`PASS composer: effort beside model at 375pt, voice joins typed text, + menu attaches a photo and a file that are priced and sent. Shots: ${out}`);
} finally { await browser?.close(); close(); }
