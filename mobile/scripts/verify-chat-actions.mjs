// The Vibyra assistant doing things to the app, run from `mobile/`:
//   node scripts/verify-chat-dids.mjs
// Drives the real chat store against a fixture that answers a tool call the
// way a model would, and checks what the app actually did: terminals opened
// with the right agent and model, the action recorded in the thread, and a
// reply written afterwards. Nothing here touches a folder — that is the point.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const output = resolve(process.env.SHOT_DIR ?? '../output/chat-actions');
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: [resolve('../desktop-tauri/tests/workspaceToolsFixture.tsx')],
  bundle: true, write: false, outfile: '/tmp/chat-dids.js', format: 'iife', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
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

/** Opens the panel with the first reply already scripted to call one tool. */
const ask = async (act, question = 'do it') => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?theme=dark&act=${encodeURIComponent(act)}`);
  await page.getByRole('tab', { name: 'Chat' }).waitFor();
  await page.getByLabel('Message Vibyra').fill(question);
  await page.getByRole('button', { name: 'Send message' }).click();
  return { page, errors };
};
const spawned = (page) => page.evaluate(() => window.fixtureSpawned());
const action = (page) => page.locator('.chat-did').last();

try {
  // ── the thing that started all this ──────────────────────────────────────
  const three = await ask('open_terminals:{"agent":"codex","count":3,"model":"GPT-6 Astra"}',
    'open three terminals on this project with gptastra');
  await action(three.page).waitFor();
  const requests = await spawned(three.page);
  assert.equal(requests.length, 3, 'three terminals, because three were asked for');
  assert.ok(requests.every(request => request.agentId === 'codex'));
  // The label a person says becomes the id the launcher wants.
  assert.ok(requests.every(request => request.model === 'openai/gpt-6-astra'),
    `model was ${requests[0]?.model}`);
  assert.ok(requests.every(request => request.cwd === '/Projects/Studio'));
  assert.match(await action(three.page).innerText(), /Opened 3 Codex terminals on GPT-6 Astra in Studio/);
  // And then it says so, rather than the thread ending on a machine line.
  await three.page.locator('.chat-turn--assistant').last().waitFor();
  await three.page.screenshot({ path: `${output}/acted.png`, clip: await three.page.locator('#project-companion').boundingBox() });
  assert.deepEqual(three.errors, []);
  await three.page.close();

  // ── "what's going on in the terminals" ───────────────────────────────────
  const looking = await ask('list_terminals:{}', 'what is going on in the terminals?');
  await action(looking.page).waitFor();
  assert.match(await action(looking.page).innerText(), /Checked the terminals/);
  assert.equal((await spawned(looking.page)).length, 0, 'looking must not launch anything');
  assert.deepEqual(looking.errors, []);
  await looking.page.close();

  // ── the screenshot: a model named the way a person says it ───────────────
  // "Open 3 terminals with GPT astra on this project pls" once answered "No
  // model here is called GPT Astra", then claimed it had opened them anyway.
  for (const said of ['GPT astra', 'gptastra', 'chat GPT astra 6']) {
    const named = await ask(`open_terminals:{"agent":"shell","count":4,"model":"${said}"}`, `open 4 terminals with ${said}`);
    await action(named.page).waitFor();
    const launched = await spawned(named.page);
    assert.equal(launched.length, 4, `"${said}" should open four`);
    assert.ok(launched.every(request => request.model === 'openai/gpt-6-astra'), `"${said}" → ${launched[0]?.model}`);
    // Naming a model names the CLI: a plain shell cannot run one, so the
    // agent the model guessed is corrected rather than obeyed.
    assert.ok(launched.every(request => request.agentId === 'codex'), `"${said}" → ${launched[0]?.agentId}`);
    assert.deepEqual(named.errors, []);
    await named.page.close();
  }

  // ── permissions, effort and an opening prompt ────────────────────────────
  const full = await ask(
    'open_terminals:{"model":"GPT-6 Astra","count":2,"permission":"full","prompt":"review the auth flow"}',
    'open two astra terminals with full permissions and tell them to review the auth flow',
  );
  await action(full.page).waitFor();
  const launched = await spawned(full.page);
  assert.equal(launched.length, 2);
  assert.ok(launched.every(request => request.permissionMode === 'full'), 'full permissions reach the launcher');
  // Codex terminals are conversations, so the opening prompt is submitted as
  // each one's first turn rather than typed into a PTY.
  const typed = await full.page.evaluate(() => window.fixtureCalls.filter(c => c.command === 'shared_chat_request' && c.args.method === 'turn.submit'));
  assert.equal(typed.length, 2, 'the opening prompt is sent to each one');
  assert.match(typed[0].args.params.text, /review the auth flow/);
  assert.match(await action(full.page).innerText(), /with full permissions/);
  await full.page.screenshot({ path: `${output}/full-permissions.png`, clip: await full.page.locator('#project-companion').boundingBox() });
  assert.deepEqual(full.errors, []);
  await full.page.close();

  // ── closing them again, by agent ─────────────────────────────────────────
  const closing = await ask('close_terminals:{"agent":"codex"}', 'close the codex terminals');
  await action(closing.page).waitFor();
  assert.match(await action(closing.page).innerText(), /No codex terminals are open|Closed \d+ terminals?/);
  assert.deepEqual(closing.errors, []);
  await closing.page.close();

  // ── a count it made up is clamped, not obeyed ────────────────────────────
  const many = await ask('open_terminals:{"agent":"codex","count":50}', 'open fifty terminals');
  await action(many.page).waitFor();
  assert.equal((await spawned(many.page)).length, 8, 'the ceiling holds whatever the model asked for');
  assert.deepEqual(many.errors, []);
  await many.page.close();

  // ── an agent that is not installed is refused, in words ──────────────────
  const missing = await ask('open_terminals:{"agent":"aider"}', 'open aider');
  await action(missing.page).waitFor();
  assert.match(await action(missing.page).innerText(), /Aider is not installed/);
  assert.equal((await spawned(missing.page)).length, 0);
  assert.ok(await missing.page.locator('.chat-did--failed').count(), 'a refusal is marked as one');
  await missing.page.screenshot({ path: `${output}/refused.png`, clip: await missing.page.locator('#project-companion').boundingBox() });
  assert.deepEqual(missing.errors, []);
  await missing.page.close();

  // ── a model nobody has is refused rather than passed through ─────────────
  const unknown = await ask('open_terminals:{"agent":"codex","model":"Definitely Not A Model"}', 'open one');
  await action(unknown.page).waitFor();
  assert.match(await action(unknown.page).innerText(), /No model here is called .*Available models include/s);
  assert.equal((await spawned(unknown.page)).length, 0);
  assert.deepEqual(unknown.errors, []);
  await unknown.page.close();

  // ── a tool that does not exist ends that call, not the conversation ──────
  const bogus = await ask('delete_the_repo:{}', 'delete everything');
  await action(bogus.page).waitFor();
  assert.match(await action(bogus.page).innerText(), /No such action: delete_the_repo/);
  await bogus.page.locator('.chat-turn--assistant').last().waitFor();
  assert.deepEqual(bogus.errors, []);
  await bogus.page.close();

  // ── an ordinary question still just answers ──────────────────────────────
  const plain = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  plain.setDefaultTimeout(9000);
  await plain.goto(`${url}/?theme=dark`);
  await plain.getByLabel('Message Vibyra').fill('what does this project do?');
  await plain.getByRole('button', { name: 'Send message' }).click();
  await plain.locator('.chat-turn--assistant').last().waitFor();
  assert.equal(await plain.locator('.chat-did').count(), 0, 'a question is not an action');
  // The tools travelled with the request even so: the model decides, not us.
  const sent = await plain.evaluate(() => window.fixtureCalls.filter(c => c.command === 'ai_chat').at(-1).args);
  assert.ok(Array.isArray(sent.tools) && sent.tools.length >= 6, 'the catalogue goes out with every question');
  assert.ok(sent.tools.some(tool => tool.function.name === 'open_terminals'));
  assert.ok(!sent.tools.some(tool => /file|shell|command/.test(tool.function.name)),
    'the assistant is never handed the folder');
  await plain.close();

  console.log('PASS: chat actions — three Codex terminals on GPT-6 Astra from one sentence, every way a person names that model, full permissions and an opening prompt, closing by agent, terminals reported without launching anything, a made-up count clamped, an uninstalled agent and an unknown model refused in words, an unknown tool contained, and an ordinary question still just answered.');
} finally {
  await browser.close();
  server.close();
}
