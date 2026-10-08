// The Vibyra assistant, asked real questions by a real model. Run from `mobile/`:
//   node scripts/verify-assistant-live.mjs            (every scenario, RUNS=3 each)
//   ONLY=fullscreen RUNS=5 node scripts/verify-assistant-live.mjs
// The chat store, tool loop, prompt and every tool are the app's own code
// (`desktop-tauri/tests/assistantLiveFixture.ts`); only native IPC is mocked.
// `ai_chat` is sent to OpenAI with the body `ai_stream.rs` builds — the model,
// effort and output cap are read from the Rust source so this tests what ships.
// Needs OPENAI_API_KEY in the environment or in ../backend/.env. Costs cents.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { SCENARIOS } from './assistant-live-scenarios.mjs';

const rust = async (file, name) => (await readFile(resolve('../desktop-tauri/src-tauri/src/commands', file), 'utf8'))
  .match(new RegExp(`const ${name}: [^=]+= "?([^";]+)"?;`))?.[1].replaceAll('_', '');
const MODEL = process.env.EVAL_MODEL ?? await rust('ai.rs', 'CHAT_MODEL');
const EFFORT = process.env.EVAL_EFFORT ?? await rust('ai.rs', 'REASONING_EFFORT');
const MAX_OUTPUT = Number(await rust('ai_clamp.rs', 'MAX_OUTPUT_TOKENS'));
const KEY = process.env.OPENAI_API_KEY
  ?? (await readFile('../backend/.env', 'utf8').catch(() => '')).match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error('No OPENAI_API_KEY in the environment or ../backend/.env');
const RUNS = Number(process.env.RUNS ?? 3);
const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const output = resolve(process.env.SHOT_DIR ?? '../output/assistant-live');
await mkdir(output, { recursive: true });

/** `ai_clamp::clamp`, so the model sees what the app would send it. */
function clamp(messages) {
  const cut = (text) => (text.length <= 8000 ? text : `${text.slice(0, 8000)}\n…[trimmed by Vibyra]`);
  const all = messages.map((message) => ({ ...message, content: cut(message.content) }));
  const system = all[0]?.role === 'system' ? all.shift() : null;
  let rest = all.slice(-24), budget = 24000 - (system?.content.length ?? 0);
  const kept = [];
  for (const message of rest.reverse()) { if (message.content.length > budget) break; budget -= message.content.length; kept.push(message); }
  return [...(system ? [system] : []), ...kept.reverse()];
}

async function complete({ messages, tools }) {
  const body = { model: MODEL, messages: clamp(messages), max_completion_tokens: MAX_OUTPUT, reasoning_effort: EFFORT };
  if (tools?.length) Object.assign(body, { tools, tool_choice: 'auto' });
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await response.json();
    if (response.status === 429 && attempt < 4) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!response.ok) return { error: json.error?.message ?? `HTTP ${response.status}` };
    const message = json.choices[0].message;
    const toolCalls = (message.tool_calls ?? []).map((call) => ({ id: call.id, name: call.function.name, arguments: call.function.arguments }));
    const text = (message.content ?? '').trim();
    if (!text && !toolCalls.length) return { error: 'The model returned an empty reply. Send the message again.' };
    return { text, stopped: false, toolCalls };
  }
}

const bundle = await build({
  entryPoints: [resolve('../desktop-tauri/tests/assistantLiveFixture.ts')],
  bundle: true, write: false, outfile: '/tmp/assistant-live.js', format: 'iife', jsx: 'automatic', define: { global: 'globalThis' },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
});
const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text;
const server = createServer(async (req, res) => {
  if (req.url === '/ai') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(await complete(JSON.parse(raw)).catch((error) => ({ error: String(error) }))));
  }
  res.setHeader('Content-Type', req.url.startsWith('/app.js') ? 'application/javascript' : 'text/html');
  res.end(req.url.startsWith('/app.js') ? js : '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });

async function runOnce(scenario) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.fixture?.ready);
    const steps = [];
    for (const message of scenario.say) {
      const turns = await page.evaluate((text) => window.fixture.ask(text), message);
      steps.push({ said: message, turns });
    }
    const state = await page.evaluate(() => window.fixture.state());
    const last = steps.at(-1).turns;
    const reply = last.filter((turn) => turn.role === 'assistant').map((turn) => turn.content).join('\n');
    const tools = last.filter((turn) => turn.role === 'tool').map((turn) => turn.tool);
    const problems = [...errors.map((error) => `page error: ${error}`), ...scenario.check({ state, reply, tools, steps })];
    const failedTurn = last.find((turn) => turn.status === 'failed');
    if (failedTurn) problems.push(`reply failed: ${failedTurn.error}`);
    return { problems, steps, reply, calls: state.calls };
  } finally { await context.close(); }
}

const chosen = SCENARIOS.filter((scenario) => !only || only.test(scenario.name));
const jobs = chosen.flatMap((scenario) => Array.from({ length: RUNS }, (_, run) => ({ scenario, run })));
const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: Number(process.env.CONCURRENCY ?? 4) }, async () => {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const result = await runOnce(job.scenario).catch((error) => ({ problems: [`harness: ${error.message}`], steps: [] }));
    results.push({ name: job.scenario.name, run: job.run, ...result });
    process.stdout.write(result.problems.length ? 'F' : '.');
  }
}));
await browser.close();
server.close();

const failures = results.filter((result) => result.problems.length);
await writeFile(`${output}/results.json`, JSON.stringify({ model: MODEL, effort: EFFORT, results }, null, 2));
console.log(`\n${MODEL} (${EFFORT}): ${results.length - failures.length}/${results.length} passed across ${chosen.length} scenarios × ${RUNS}`);
for (const failure of failures) {
  console.log(`\n✗ ${failure.name} #${failure.run}: ${failure.problems.join('; ')}`);
  console.log(`  model called: ${(failure.calls ?? []).join(' | ') || 'nothing'}`);
  for (const step of failure.steps) {
    console.log(`  › ${step.said}`);
    for (const turn of step.turns) console.log(`    ${turn.role === 'tool' ? `[${turn.tool?.failed ? 'FAILED ' : ''}${turn.tool?.name}] ${turn.tool?.summary}` : `${turn.role}: ${turn.content.slice(0, 220).replace(/\n/g, ' ')}`}`);
  }
}
process.exit(failures.length ? 1 : 0);
