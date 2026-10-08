import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choice, codeBlock, finalAnswer, integer } from "../lib/extract.mjs";
import { bootstrap, tied } from "../lib/stats.mjs";
import { runPython } from "../lib/sandbox.mjs";
import { openRun } from "../lib/store.mjs";
import { run } from "../lib/runner.mjs";
import { aggregate } from "../lib/aggregate.mjs";
import knowledge from "../suites/knowledge.mjs";
import code from "../suites/code.mjs";

test("answers are read only from the final ANSWER line", () => {
    assert.equal(finalAnswer("ANSWER: 3\nwait\nANSWER: 12"), "12");
    assert.equal(choice("I think B.\nANSWER: (c)"), "C");
    assert.equal(choice("The answer is C"), null);
    assert.equal(integer("ANSWER: **1,024**"), 1024);
    assert.equal(codeBlock("x\n```js\nno\n```\n```python\nyes = 1\n```"), "yes = 1\n");
});

test("bootstrap intervals are deterministic and contain the mean", () => {
    const a = bootstrap([1, 0, 1, 1, 0, 1, 1, 1]);
    assert.deepEqual(a, bootstrap([1, 0, 1, 1, 0, 1, 1, 1]));
    assert.ok(a.low <= a.mean && a.mean <= a.high);
    assert.ok(tied({ low: 0.5, high: 0.7 }, { low: 0.6, high: 0.9 }));
    assert.ok(!tied({ low: 0.1, high: 0.2 }, { low: 0.6, high: 0.9 }));
});

test("the sandbox blocks the network and kills runaway code", async () => {
    const net = await runPython({ "t.py": "import urllib.request\nurllib.request.urlopen('https://example.com', timeout=3)" }, "t.py");
    assert.equal(net.ok, false);
    const loop = await runPython({ "t.py": "while True: pass" }, "t.py", { timeoutMs: 1000 });
    assert.equal(loop.timedOut, true);
});

const fixture = {
    id: "fixture",
    tasks: [{ id: "one", want: "1" }, { id: "two", want: "2" }, { id: "three", want: "3" }],
    messages: (t) => [{ role: "user", content: `say ${t.want}` }],
    grade: (t, text) => ({ score: text === `ANSWER: ${t.want}` ? 1 : 0 }),
};
const fakeModel = (right) => async ({ messages }) => ({
    text: right ? `ANSWER: ${messages[0].content.slice(4)}` : "ANSWER: 0",
    cost: 0.5, speed: 50, ttft: 1, tokensOut: 10, tokensIn: 5,
});

test("runs resume without paying twice, and stop at the spending cap", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "bench-")), "run.jsonl");
    const models = [{ id: "good", openrouter: "good" }, { id: "bad", openrouter: "bad" }];
    let calls = 0;
    const complete = async (args) => { calls++; return fakeModel(args.model === "good")(args); };
    const capped = await run({ models, suites: [fixture], repeats: 2, complete, store: await openRun(file), key: "k", maxUsd: 2, concurrency: 1 });
    assert.equal(capped.stopped, true);
    const before = calls;
    await run({ models, suites: [fixture], repeats: 2, complete, store: await openRun(file), key: "k", maxUsd: 100 });
    assert.equal(calls - before, 12 - before, "only the missing attempts were called");
    const rows = (await openRun(file)).rows();
    const table = aggregate(rows, { roster: models, suites: ["fixture"], indexSuites: ["fixture"] });
    assert.equal(table.find((m) => m.id === "good").index, 100);
    assert.equal(table.find((m) => m.id === "bad").index, 0);
    assert.deepEqual(table.find((m) => m.id === "good").rank, { best: 1, worst: 1 });
});

test("shuffled options are graded against the moved answer", () => {
    const task = { id: "q1", question: "?", options: ["w", "x", "y", "z"], answer: "C" };
    for (const attempt of [0, 1, 2]) {
        const shown = knowledge.messages(task, attempt)[0].content;
        const letter = shown.match(/([A-D])\. y/)[1];
        assert.equal(knowledge.grade(task, `ANSWER: ${letter}`, attempt).score, 1);
    }
});

test("private coding tasks accept their reference and reject a wrong answer", { skip: !existsSync(new URL("../private/code-write.mjs", import.meta.url)) }, async () => {
    const [{ default: write }, { default: fix }] = await Promise.all([import("../private/code-write.mjs"), import("../private/code-fix.mjs")]);
    for (const t of [write[0], fix[0]]) {
        assert.equal((await code.grade(t, `\`\`\`python\n${t.reference}\n\`\`\``)).score, 1, t.id);
        assert.equal((await code.grade(t, "```python\npass\n```")).score, 0, t.id);
    }
});
