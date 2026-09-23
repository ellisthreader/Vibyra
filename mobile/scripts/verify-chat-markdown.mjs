// Rendered markdown in a reply, run from `mobile/`:
//   node scripts/verify-chat-markdown.mjs
// Proves the one thing the renderer exists to guarantee — a streamed table row
// cannot move a column — plus the safety rules around it: an open fence offers
// no Copy and no Run, a `javascript:` destination never becomes an anchor, and
// no prefix of a streaming reply ever paints a raw pipe row or a stray `**`.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { capture, until } from './ui-test-helpers.mjs';

const output = resolve('../output/chat-markdown');
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: [resolve('../desktop-tauri/tests/chatMarkdownFixture.tsx')],
  bundle: true, write: false, outfile: '/tmp/chat-markdown.js', format: 'iife', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
  // SafeLink reaches for `invoke` at module scope; outside the shell there is
  // no Tauri to reach, and a throwing import would read as a renderer bug.
  plugins: [{ name: 'tauri-stub', setup(b) {
    b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: 'core', namespace: 'tauri-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'tauri-stub' }, () => ({ contents: 'export const invoke = async () => {};', loader: 'js' }));
  } }],
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
let summary = null;
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const columns = page => page.locator('#doc thead th').evaluateAll(cells =>
  cells.map(cell => { const box = cell.getBoundingClientRect(); return [box.x, box.width]; }));
const held = (before, after, why) => {
  assert.equal(before.length, after.length, why);
  before.forEach(([x, w], at) => assert.ok(Math.abs(x - after[at][0]) < 1 && Math.abs(w - after[at][1]) < 1,
    `${why}: column ${at} moved ${(x - after[at][0]).toFixed(2)}px and resized ${(w - after[at][1]).toFixed(2)}px`));
};

try {
  for (const width of [320, 380, 760]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(9000);
      const errors = [];
      page.on('pageerror', event => errors.push(event.message));
      await page.goto(`${url}/?${theme}`);
      await page.locator('#doc table').waitFor();
      const label = `${width}-${theme}`;

      // ── a real table, named columns, and headings that yield to the panel ───
      assert.deepEqual(await page.locator('#doc').getByRole('columnheader').allInnerTexts(), ['Command', 'What it does', 'Notes'],
        'headers are real column headers, not divs a screen reader has to guess at');
      assert.equal(await page.locator('#doc h1, #doc h2, #doc h3').count(), 0, 'a reply never outranks the panel around it');
      assert.equal(await page.locator('#doc h4').innerText(), 'Workspace answer');
      assert.equal(await page.locator('#doc h5').innerText(), 'Checks worth running');

      // ── nesting is a tree, and a checkbox is a record, not a control ────────
      assert.equal(await page.locator('#doc ul > li > ul > li').innerText(), 'Lines first, then knip');
      const tasks = page.locator('#doc [role="checkbox"]');
      assert.deepEqual(await tasks.evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-checked'))), ['false', 'true']);
      assert.deepEqual(await tasks.evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-disabled'))), ['true', 'true']);
      assert.equal(await page.locator('#doc ol > li').count(), 2, 'an ordered list is its own list, not more bullets');

      // ── one anchor: the https one. The `javascript:` destination stays text ─
      const links = page.locator('#doc a');
      assert.equal(await links.count(), 1, 'a rejected destination must never become an anchor');
      assert.equal(await links.getAttribute('href'), 'https://vibyra.app/');
      assert.match(await page.locator('#doc p').last().innerText(), /the trap \(javascript:alert\(1\)\)/);

      // ── Run is gated on the language, and hands back the exact command ──────
      assert.equal(await page.locator('#doc .md-code').count(), 2);
      const run = page.locator('#doc').getByRole('button', { name: 'Run' });
      assert.equal(await run.count(), 1, 'python is not a shell');
      assert.equal(await page.locator('#doc .md-code').nth(1).getByRole('button', { name: 'Run' }).count(), 0);
      assert.equal(await run.getAttribute('title'), 'Run this command');
      await run.click();
      assert.deepEqual(await page.evaluate(() => window.runs()), ['npm run verify']);

      // ── the invariant: a streamed row cannot move a column ─────────────────
      const before = await columns(page);
      await page.evaluate(() => window.streamRow());
      await frame(page);
      assert.match(await page.locator('#doc tbody tr').nth(1).innerText(), /every Rust gate in order/);
      const after = await columns(page);
      held(before, after, 'a row far longer than its header');
      await page.evaluate(() => window.streamRow());
      await frame(page);
      held(after, await columns(page), 'a third row');

      // ── it fits the window, and offers the keyboard a stop only when it must ─
      const wrap = page.locator('#doc .md-table');
      const scrolls = await wrap.evaluate(node => node.scrollWidth > node.clientWidth + 1);
      assert.equal(await wrap.getAttribute('role'), scrolls ? 'region' : null, 'no dead tab stop on a table that fits');
      assert.equal(await wrap.getAttribute('tabindex'), scrolls ? '0' : null);
      if (width === 320) {
        assert.ok(scrolls, 'three columns cannot fit a 320px sidebar');
        assert.ok(await wrap.evaluate(n => { n.scrollLeft = 400; const at = n.scrollLeft; n.scrollLeft = 0; return at > 0; }),
          'it scrolls sideways inside itself');
      }
      if (width === 760) assert.equal(scrolls, false, 'a wide panel needs no scroller');
      await capture(page, `${output}/viewport-${label}.png`);
      await page.locator('#doc').screenshot({ path: `${output}/doc-${label}.png` });

      // ── widths follow the container, not the window ────────────────────────
      await page.evaluate(() => window.setWidth(360));
      await until(async () => (await wrap.getAttribute('role')) === 'region', 'the observer re-measured a narrowed panel');
      await page.evaluate(() => window.setWidth(0));
      await frame(page);

      // ── the prefix ladder: every prefix, not a sample of them ──────────────
      // Walked inside the page because `step()` commits synchronously, so one
      // round-trip covers ~240 prefixes instead of ~240 round-trips.
      const stream = page.locator('#stream');
      const walk = await page.evaluate(() => {
        const region = document.querySelector('#stream');
        // Laid-out position, not viewport position: a screenshot scrolls the page.
        const first = () => region.querySelector('.md-doc > *')?.offsetTop ?? -1;
        const strays = [], moved = [], tools = [], opens = [], shrinks = [], modes = [];
        window.seek(0);
        const top = first();
        let previous = region.innerText.length;
        for (let at = 0; at < window.steps(); at++) {
          window.seek(at);
          const text = region.innerText;
          // No markdown punctuation reaches the reader at any prefix, ever. This
          // reads the rendered text, not the source, so it needs no notion of
          // which runs are closable: a closed `_fast_` is already an `<em>` and
          // has no underscore left to find. Every one of these characters exists
          // in the source only as a delimiter, so one class covers all of them.
          const tail = JSON.stringify(text.slice(-28));
          if (/[*_~`|]/.test(text)) strays.push(`${at} ${tail} of ${JSON.stringify(window.prefix().slice(-40))}`);
          if (Math.abs(first() - top) > 1) moved.push(at);
          if (text.length < previous) shrinks.push(`${at}: ${tail}`);
          previous = text.length;
          // Streaming only while it streams: the last prefix is the whole reply,
          // and a settled reply must be re-parsed plainly or a tail that ended
          // mid-run would stay hidden and read as truncated output.
          if (window.mode() !== (at === window.steps() - 1 ? 'settled' : 'streaming')) modes.push(at);
          const fence = region.querySelector('.md-code[data-streaming="true"]');
          if (fence) {
            opens.push(at);
            if (fence.querySelectorAll('header button').length) tools.push(`${at}: tools`);
            if (!fence.querySelector('.md-code__caret')) tools.push(`${at}: no caret`);
          }
        }
        return { strays, moved, tools, opens, shrinks, modes, steps: window.steps() };
      });
      assert.deepEqual(walk.strays, [], 'no prefix paints a delimiter or a raw pipe row');
      assert.deepEqual(walk.moved, [], 'the block already read never moves under the reader');
      assert.deepEqual(walk.modes, [], 'streamed while it arrives, parsed plainly the moment it lands');
      assert.deepEqual(walk.tools, [], 'an open fence offers no Copy and no Run, and always a caret');
      assert.ok(walk.opens.length > 8, 'the ladder walked through an open fence');
      // The contract: a run appears whole or not at all, so the visible tail may
      // shorten as one opens. A "fix" that re-rendered a partial run would make
      // this zero, and would otherwise go unnoticed.
      assert.ok(walk.shrinks.length > 0, `the visible tail never shrank in ${walk.steps} steps`);

      // ── and the settled reply, parsed once more with no streaming ─────────
      await page.evaluate(index => window.seek(index), walk.opens[Math.floor(walk.opens.length * 0.62)]);
      await stream.screenshot({ path: `${output}/open-fence-${label}.png` });
      await page.evaluate(() => window.seek(window.steps() - 1));
      assert.equal(await stream.locator('.md-code[data-streaming="true"]').count(), 0);
      assert.equal(await stream.getByRole('button', { name: 'Copy' }).count(), 2, 'Copy arrives with each closing fence');
      assert.equal(await stream.locator('table').count(), 1);
      assert.equal(await stream.locator('tbody tr').count(), 1);
      assert.match(await stream.innerText(), /rendering this as it arrives.+kept whole/s, 'the settled reply hides nothing');
      await capture(page, `${output}/settled-${label}.png`);
      await stream.screenshot({ path: `${output}/stream-${label}.png` });

      summary = walk;
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log(`PASS: markdown rendering — columns hold still while a row streams in (<1px across three streamed rows), nested lists and non-interactive task marks, headings at h4+, one anchor for https and none for javascript:, Run only on a closed shell fence. Every one of ${summary.steps} prefixes of a streamed reply was walked, through two fences and five inline forms: not one * _ ~ \` or | reached the reader at any of them, the first block never moved, and the visible tail shrank on ${summary.shrinks.length} (${summary.shrinks.map(p => p.split(":")[0]).join(", ")}) — a run appears whole or not at all. 320/380/760 in both themes.`);
} finally {
  await browser.close();
  server.close();
}
