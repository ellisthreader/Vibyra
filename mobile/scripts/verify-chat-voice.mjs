// Voice mode in the sidebar, run from `mobile/`:
//   node scripts/verify-chat-voice.mjs
// Drives a whole conversation against mocked audio: the panel becomes the
// circle, a turn ends on its own pause, what it heard is repeated back, the
// reply is read aloud and marked in the transcript, and the microphone reopens
// for the next turn. No real microphone or speaker is involved — this proves
// the loop and the surface, not the audio hardware.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const output = resolve('../output/chat-voice');
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: [resolve('../desktop-tauri/tests/workspaceToolsFixture.tsx')],
  bundle: true, write: false, outfile: '/tmp/chat-voice.js', format: 'iife', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
  // Model gallery assets use Vite's glob transform; they are outside this chat fixture.
  plugins: [{ name: 'art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl=()=>null;', loader: 'ts' })); } }],
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'));
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'));
const server = createServer((req, res) => {
  const file = req.url.startsWith('/app.js') ? js : req.url.startsWith('/app.css') ? css : null;
  res.setHeader('Content-Type', file ? (req.url.startsWith('/app.js') ? 'application/javascript' : 'text/css') : 'text/html');
  res.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const open = async (search = '') => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?${search}`);
  await page.getByRole('tab', { name: 'Chat' }).waitFor();
  return { page, errors };
};
const shot = async (page, name) => {
  const box = await page.locator('#project-companion').boundingBox();
  await page.screenshot({ path: `${output}/${name}.png`, clip: box });
};
const commands = (page) => page.evaluate(() => window.fixtureCalls.map(call => call.command));
// Colour, ring behaviour and the live halo all come from one phase attribute,
// so reading it back reads the state the design is drawing.
const orbPhase = (page) => page.locator('.orb').getAttribute('data-phase');

try {
  for (const theme of ['dark', 'light']) {
    const { page, errors } = await open(`theme=${theme}&slow-chat&speech-ends`);
    const mode = page.locator('.voice-mode');
    const start = page.getByRole('button', { name: 'Start a voice conversation' });

    // ── the composer offers it; starting it replaces the page ────────────
    await start.waitFor();
    assert.equal(await mode.count(), 0, 'voice mode only exists while a conversation is running');
    await start.click();
    await mode.getByText('Listening').waitFor();
    // Observe the short simulated speech burst before other UI round trips
    // consume it on a busy Mac. The microphone is deliberately quiet afterward.
    await page.waitForFunction(() => {
      const glow = document.querySelector('.orb__glow');
      return glow && Number(getComputedStyle(glow).opacity) > 0.5;
    }, null, { timeout: 4000 });
    assert.equal(await orbPhase(page), 'listening');
    await shot(page, `listening-${theme}`);
    // Unmistakably not the chat page: no composer, no bubbles, one circle.
    assert.equal(await page.getByLabel('Message Vibyra').count(), 0, 'voice mode is not the chat page with an extra bar');
    assert.equal(await page.locator('.chat-turn').count(), 0);
    assert.equal(await page.locator('.orb').count(), 1);
    // And the tab says a conversation is running, wherever you go next.
    assert.equal(await page.locator('.companion__tab--talking').innerText(), 'Chat');
    // ── the pause ends the turn by itself: no second keypress ────────────
    await mode.getByText('Thinking').waitFor();
    assert.equal(await orbPhase(page), 'thinking');
    // It repeats back what it heard, so a mis-hearing is obvious at once.
    await mode.getByText('Please review these changes.').waitFor();
    assert.deepEqual(
      (await commands(page)).filter(name => name === 'voice_stop').length, 1,
      'one stop per turn, sent by the pause rather than by hand',
    );
    await shot(page, `thinking-${theme}`);

    // ── the answer is spoken, and the circle changes colour with it ──────
    await mode.getByText('Speaking').waitFor();
    assert.equal(await orbPhase(page), 'speaking');
    await mode.getByText(/The changes are ready for review/).waitFor();
    assert.ok(await page.evaluate(() => window.fixtureSpeech()), 'a reply is actually playing');
    await shot(page, `speaking-${theme}`);

    // ── the transcript is one tap away, and the conversation keeps going ─
    await page.getByRole('button', { name: 'Show transcript' }).click();
    await page.getByLabel('Message Vibyra').waitFor();
    assert.match(
      await page.locator('.chat-turn--speaking').innerText(),
      /The changes are ready for review/,
      'the bubble being read aloud is the one that is marked',
    );
    await page.locator('.voice-strip').getByText('Speaking').waitFor();
    // One microphone in the composer, not two that look the same at 17px.
    assert.equal(await page.locator('.chat-input .chat-voice-button').count(), 1,
      'the composer offers one voice control');
    await shot(page, `transcript-${theme}`);
    await page.locator('.voice-strip__back').click();
    await mode.waitFor();

    // ── and then it listens again, with no keypress in between ───────────
    await mode.getByText('Listening').waitFor();
    assert.ok(
      (await commands(page)).filter(name => name === 'voice_start').length >= 2,
      'the microphone reopens once the Mac has finished talking',
    );

    // ── ending it stops both halves and gives the chat page back ─────────
    await page.getByRole('button', { name: /End conversation/ }).click();
    await page.getByLabel('Message Vibyra').waitFor();
    assert.equal(await page.locator('.orb').count(), 0);
    assert.equal(await page.evaluate(() => window.fixtureSpeech()), null, 'ending it stops the speech');
    assert.equal(await page.locator('.companion__tab--talking').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  }

  // ── a spoken reply is asked for in spoken language, in the chosen voice ─
  const { page, errors } = await open('theme=dark&speech-ends');
  await page.getByRole('button', { name: 'Start a voice conversation' }).click();
  await page.locator('.voice-mode').getByText('Speaking').waitFor();
  const prompt = await page.evaluate(() => window.fixtureCalls
    .filter(call => call.command === 'ai_chat').at(-1).args.messages[0].content);
  assert.match(prompt, /spoken aloud/, 'the voice turn asks for an answer written to be heard');
  assert.match(prompt, /No markdown/);
  const spoke = await page.evaluate(() => window.fixtureCalls.filter(call => call.command === 'speech_start').at(-1).args);
  assert.equal(spoke.voice, 'nova', 'the chosen Vibyra voice reaches the speech service rather than being dropped on the way');
  await page.getByRole('button', { name: /End conversation/ }).click();
  assert.deepEqual(errors, []);
  await page.close();

  // ── typing still works, and never asks for the spoken style ───────────
  const typed = await open('theme=dark');
  await typed.page.getByLabel('Message Vibyra').fill('What changed?');
  await typed.page.getByRole('button', { name: 'Send message' }).click();
  await typed.page.getByText('The changes are ready for review. The workspace keeps your current work intact.').waitFor();
  const typedPrompt = await typed.page.evaluate(() => window.fixtureCalls
    .filter(call => call.command === 'ai_chat').at(-1).args.messages[0].content);
  assert.doesNotMatch(typedPrompt, /spoken aloud/, 'a typed question keeps the full written answer');
  assert.deepEqual(typed.errors, []);
  await typed.page.close();

  console.log('PASS: voice mode — the panel becomes one circle, a turn ends on its own pause, what it heard is repeated back, the circle changes colour as it speaks, the transcript is one tap away and marks the spoken reply, the microphone reopens by itself, and ending it gives the chat page back. Both themes at 1280.');
} finally {
  await browser.close();
  server.close();
}
