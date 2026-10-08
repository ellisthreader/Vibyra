#!/usr/bin/env node
// Vibyra Bench. Usage:
//   node bench/cli.mjs estimate [--models a,b] [--suites code,math]
//   node bench/cli.mjs run --max-usd 50 [--models a,b|all] [--suites ...] [--limit N] [--repeats N] [--run 2026-09] [--mock]
//   node bench/cli.mjs report [--run 2026-09]
//   node bench/cli.mjs publish [--run 2026-09]
//   node bench/cli.mjs consensus        (averages the public leaderboards in consensus/sources)
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { SUITES, INDEX_SUITES } from "./suites/index.mjs";
import { complete } from "./lib/openrouter.mjs";
import { mockComplete } from "./lib/mock.mjs";
import { openRun } from "./lib/store.mjs";
import { run } from "./lib/runner.mjs";
import { aggregate } from "./lib/aggregate.mjs";
import { openRouterKey, openRouterPricing } from "./lib/env.mjs";
import { publish } from "./lib/publish.mjs";
import { buildConsensus, CONSENSUS } from "./lib/consensus-publish.mjs";

const { positionals: [command = "help"], values: opt } = parseArgs({
    allowPositionals: true,
    options: {
        models: { type: "string", default: "all" }, suites: { type: "string", default: INDEX_SUITES.join(",") },
        limit: { type: "string" }, repeats: { type: "string" }, run: { type: "string", default: new Date().toISOString().slice(0, 7) },
        "max-usd": { type: "string" }, concurrency: { type: "string", default: "4" }, mock: { type: "boolean" }, env: { type: "string" },
    },
});

const roster = JSON.parse(await readFile(new URL("./roster.json", import.meta.url), "utf8")).models;
const models = opt.models === "all" ? roster : opt.models.split(",").map((id) => roster.find((m) => m.id === id) ?? fail(`Unknown model ${id}`));
const suiteIds = opt.suites.split(",");
const runFile = new URL(`./runs/${opt.run}${opt.mock ? "-mock" : ""}.jsonl`, import.meta.url).pathname;
const limit = opt.limit ? Number(opt.limit) : undefined;

async function loadSuites() {
    return Promise.all(suiteIds.map(async (id) => {
        const suite = SUITES[id] ?? fail(`Unknown suite ${id}`);
        return { ...suite, tasks: await suite.load({ limit }) };
    }));
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

if (command === "estimate") {
    const [suites, pricing] = await Promise.all([loadSuites(), openRouterPricing()]);
    let total = 0;
    for (const m of models) {
        const p = pricing[m.openrouter] ?? fail(`${m.openrouter} is not on OpenRouter`);
        const usd = suites.reduce((sum, s) => sum + s.tasks.length * (Number(opt.repeats) || s.repeats)
            * (s.tokensPerTask * p.out + 1500 * p.in) / 1e6, 0);
        total += usd;
        console.log(`${m.name.padEnd(24)} ~$${usd.toFixed(0)}`);
    }
    console.log(`\nAbout $${total.toFixed(0)} for ${models.length} models (list prices, typical reasoning length; real runs vary ±50%).`);
} else if (command === "run") {
    const maxUsd = opt.mock ? Infinity : Number(opt["max-usd"] ?? fail("Set a spending cap with --max-usd"));
    const key = opt.mock ? "mock" : (await openRouterKey(opt.env)) ?? fail("No OPENROUTER_API_KEY (env, --env file, or backend/.env)");
    const suites = await loadSuites();
    if (opt.repeats) suites.forEach((s) => { s.repeats = Number(opt.repeats); });
    const store = await openRun(runFile);
    const caller = opt.mock ? mockComplete([]) : complete;
    const result = await runSuites({ models, suites, store, key, maxUsd, caller });
    console.log(`\nDone: $${result.spent.toFixed(2)} spent${result.stopped ? " (stopped at the cap; re-run to continue)" : ""}. Log: ${runFile}`);
} else if (command === "report" || command === "publish") {
    const rows = (await openRun(runFile)).rows();
    if (!rows.length) fail(`No results in ${runFile}`);
    const table = aggregate(rows, { roster, suites: suiteIds, indexSuites: INDEX_SUITES, pricing: await openRouterPricing() });
    for (const m of [...table].sort((a, b) => (b.index ?? -1) - (a.index ?? -1))) {
        const s = INDEX_SUITES.map((id) => `${id} ${m.scores[id]?.score ?? "–"}`).join("  ");
        console.log(`${m.name.padEnd(24)} index ${String(m.index ?? "–").padStart(5)}  ${s}  ${m.publishable ? "" : "(not publishable)"}`);
    }
    if (command === "publish") console.log(`\nWrote ${await publish(table, { run: opt.run, suites: suiteIds.map((id) => SUITES[id]) })}`);
} else if (command === "consensus") {
    const doc = await buildConsensus(roster);
    for (const w of doc.warnings) console.log(`warning: ${w}`);
    console.log(`${doc.sources.length} sources used:`);
    for (const src of doc.sources) console.log(`  ${src.name.padEnd(44)} ${src.category.padEnd(11)} ${src.models} models`);
    console.log("");
    for (const m of [...doc.models].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) {
        const name = roster.find((r) => r.id === (m.modelId ?? m.id)).name + (m.effort ? ` (${m.effort})` : "");
        console.log(`${name.padEnd(24)} ${String(m.score ?? "–").padStart(5)}  ${m.sourceCount} sources  ${m.agreement ?? ""}${m.provisional ? "  (early data)" : ""}`);
    }
    console.log(`\nWrote ${CONSENSUS}`);
} else {
    console.log((await readFile(new URL(import.meta.url), "utf8")).split("\n").slice(1, 8).join("\n"));
}

// Suites with different repeat counts run one after another under one cap.
async function runSuites({ models, suites, store, key, maxUsd, caller }) {
    let spent = 0;
    let stopped = false;
    for (const suite of suites) {
        if (stopped) break;
        const result = await run({ models, suites: [suite], repeats: suite.repeats, complete: caller, store, key, maxUsd,
            concurrency: Number(opt.concurrency), log: (line) => console.log(line) });
        spent = result.spent;
        stopped = result.stopped;
    }
    return { spent, stopped };
}
