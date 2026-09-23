// The streaming chat surface in the sidebar, run from `mobile/`:
//   node scripts/verify-chat-streaming.mjs
// Drives the real panel against a mocked `ai_chat` that answers over the Tauri
// channel a word at a time, the way Rust does. What it proves is everything a
// one-shot mock could never show: the dots hold the place until the first
// token, the reply grows by prefix instead of being replaced, it arrives as
// rendered markdown rather than pipes and hyphens, the returned text wins over
// the deltas, Stop leaves a short reply with a way back, a broken stream keeps
// the question, and the actions stay hidden until a pointer or a Tab asks.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

import { capture, until } from './ui-test-helpers.mjs';

const output = resolve('../output/chat-streaming');
await mkdir(output, { recursive: true });
// The desktop fixture, bundled whole: `fixture-server.mjs` is mobile-shaped and
// drops the thirty stylesheet imports, so its screenshots would prove nothing.
const bundle = await build({
  entryPoints: [resolve('../desktop-tauri/tests/workspaceToolsFixture.tsx')],
  bundle: true, write: false, outfile: '/tmp/chat-streaming.js', format: 'iife', jsx: 'automatic',
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

const CLOSING = 'The changes are ready for review. The workspace keeps your current work intact.';
const QUESTION = 'What changed in the workspace?';

const open = async (search, options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, ...options });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?${search}`);
  await page.getByRole('textbox', { name: 'Message Vibyra' }).waitFor();
  // The seeded conversation is somebody else's proof; this one starts empty so
  // "the last assistant turn" can only ever mean the reply under test.
  await page.getByRole('button', { name: 'Conversation options' }).click();
  await page.getByRole('menuitem', { name: 'Clear conversation' }).click();
  return { page, errors };
};
const calls = (page, command) => page.evaluate(c => window.fixtureCalls.filter(x => x.command === c).length, command);
const reply = (page) => page.locator('.chat-turn--assistant').last();
// The rendered reply alone: the hover actions sit in the same bubble at
// `opacity: 0`, and `innerText` would happily read "Copy reply" out of them.
const replyText = (page) => reply(page).locator('.md-doc').innerText();
const settled = (page) => until(async () => {
  const busy = await reply(page).getAttribute('aria-busy');
  return busy === null ? replyText(page) : null;
}, 'the reply settles');
const ask = async (page) => {
  await page.getByRole('textbox', { name: 'Message Vibyra' }).fill(QUESTION);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
};

try {
  for (const theme of ['dark', 'light']) {
    // ── the dots hold the place until the first token ──────────────────
    const { page, errors } = await open(`theme=${theme}&slow-chat`);
    await ask(page);
    // Read in one round trip: the pause before the first token is finite, and
    // three separate queries could straddle its end.
    const waiting = await until(() => page.evaluate(() => {
      if (!document.querySelector('.chat-turn__bubble--thinking')) return null;
      return {
        rendered: document.querySelectorAll('.chat-turn--assistant .md-doc').length,
        carets: document.querySelectorAll('.chat-caret').length,
        busy: document.querySelectorAll('.chat-turn[aria-busy="true"]').length,
      };
    }), 'the thinking dots appear before the first token');
    assert.deepEqual(waiting, { rendered: 0, carets: 0, busy: 1 },
      'an empty bubble with a caret in it would read as broken, not as thinking');
    await capture(page, `${output}/thinking-${theme}.png`);

    // ── the reply grows by prefix, never replaced ──────────────────────
    const first = await until(async () => {
      const text = await replyText(page);
      return text.length > 30 ? text : null;
    }, 'the first words arrive');
    const second = await until(async () => {
      const text = await replyText(page);
      return text.length > first.length + 20 ? text : null;
    }, 'the reply keeps growing');
    assert.ok(second.startsWith(first), 'a growing reply extends what is already on screen');
    assert.ok(first.length < second.length, 'a one-shot mock could never produce two lengths');
    // The mock deliberately withholds the final word from the channel, so the
    // only way it can ever appear is the returned text winning.
    assert.doesNotMatch(second, /intact/, 'the last word has not crossed the channel');
    await capture(page, `${output}/streaming-${theme}.png`);

    // ── it settles into rendered markup, and the returned text wins ────
    await settled(page);
    const closing = await reply(page).locator('.md-doc > p').last().innerText();
    assert.equal(closing, CLOSING, 'the returned text is authoritative over the deltas it followed');
    const shape = await reply(page).evaluate(el => ({
      tables: el.querySelectorAll('table').length,
      items: el.querySelectorAll('ul li').length,
      code: el.querySelectorAll('pre').length,
      run: el.querySelectorAll('.md-run').length,
      mark: el.querySelectorAll('.vibyra-mark img').length,
      carets: el.querySelectorAll('.chat-caret').length,
      raw: /\|\s*File\s*\|/.test(el.innerText) || el.innerText.includes('```'),
    }));
    assert.deepEqual(shape, { tables: 1, items: 2, code: 1, run: 1, mark: 1, carets: 0, raw: false },
      'a reply renders as a table, a list and a code block — never as pipes and hyphens');
    assert.equal(await calls(page, 'ai_chat'), 1, 'one question, one request');
    assert.equal(await calls(page, 'speech_start'), 0, 'a streaming reply must never autoplay');

    // ── the actions are hover-revealed, and a keyboard still finds them ─
    const actions = reply(page).locator('.chat-actions');
    const opacity = () => actions.evaluate(el => getComputedStyle(el).opacity);
    assert.equal(await opacity(), '0', 'a reply is not wearing a permanent button bar');
    await reply(page).hover();
    await until(async () => (await opacity()) === '1', 'hovering a reply reveals its actions');
    await capture(page, `${output}/actions-${theme}.png`);
    await page.mouse.move(2, 2);
    await until(async () => (await opacity()) === '0', 'they go away again');
    await page.evaluate(() => document.activeElement?.blur?.());
    let reached = false;
    for (let step = 0; step < 40 && !reached; step++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => Boolean(document.activeElement?.closest('.chat-actions')));
    }
    assert.ok(reached, 'Tab reaches the reply actions, which `display: none` would have removed');
    // A started transition still reports its old value, so this waits a frame.
    await until(async () => (await opacity()) === '1', 'they appear as soon as focus lands');
    assert.deepEqual(errors, []);
    await page.close();

    // ── Stop leaves a short reply with a way back ──────────────────────
    const { page: cut, errors: cutErrors } = await open(`theme=${theme}&slow-chat`);
    await ask(cut);
    const partial = await until(async () => {
      const text = await replyText(cut);
      return text.length > 40 ? text : null;
    }, 'text arrives before Stop');
    await cut.getByRole('button', { name: 'Stop the reply' }).click();
    assert.equal(await calls(cut, 'ai_chat_stop'), 1, 'Stop asks once');
    const short = await settled(cut);
    assert.ok(short.length >= partial.length, 'whatever had arrived is kept');
    assert.doesNotMatch(short, /current work intact/, 'a stopped reply is a short reply');
    await cut.getByRole('button', { name: 'Send message', exact: true }).waitFor();
    await reply(cut).hover();
    await cut.getByRole('button', { name: 'Retry' }).waitFor();
    await capture(cut, `${output}/stopped-${theme}.png`);
    assert.deepEqual(cutErrors, []);
    await cut.close();

    // ── a broken stream keeps the question, and Retry does not repeat it ─
    const { page: broken, errors: brokenErrors } = await open(`theme=${theme}&chat-error`);
    await ask(broken);
    const alert = broken.getByRole('alert');
    await alert.waitFor();
    assert.match(await alert.innerText(), /stopped responding/, 'it says what went wrong, once');
    assert.equal(await broken.locator('.chat-turn--user').count(), 1, 'the question stays where it was');
    assert.equal(await calls(broken, 'ai_chat'), 1);
    await capture(broken, `${output}/failed-${theme}.png`);
    await reply(broken).hover();
    await broken.getByRole('button', { name: 'Retry' }).click();
    await until(async () => (await calls(broken, 'ai_chat')) === 2, 'Retry runs the reply again');
    assert.equal(await broken.locator('.chat-turn--user').count(), 1, 'and never asks the question twice');
    assert.deepEqual(brokenErrors, []);
    await broken.close();

    // ── the caret is a still bar, so motion settings cannot hide it ────
    const { page: still, errors: stillErrors } = await open(`theme=${theme}&slow-chat`, { reducedMotion: 'reduce' });
    await ask(still);
    const caret = await until(async () => {
      if (!(await still.locator('.chat-caret').count())) return null;
      return still.locator('.chat-caret').first().evaluate(el => {
        const style = getComputedStyle(el);
        return { animation: style.animationName, width: style.width, opacity: style.opacity, tall: parseFloat(style.height) > 8 };
      });
    }, 'the caret appears once the reply has text');
    assert.deepEqual(caret, { animation: 'none', width: '2px', opacity: '1', tall: true },
      'a steady bar needs no exemption from reduced motion, and a blink would');
    assert.deepEqual(stillErrors, []);
    await still.close();
  }
  console.log('PASS: streaming chat — the dots hold until the first token, the reply grows by prefix into a rendered table, list and code block, the returned text wins over the deltas, nothing autoplays, Stop leaves a short reply with Retry, a broken stream keeps the question and retries without repeating it, the actions are hover-revealed yet reachable by Tab, and the caret survives reduced motion. Both themes at 1280.');
} finally {
  await browser.close();
  server.close();
}
