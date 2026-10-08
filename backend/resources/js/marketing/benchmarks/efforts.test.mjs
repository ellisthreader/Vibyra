import test from "node:test";
import assert from "node:assert/strict";
import { fromConsensus } from "./fromConsensus.js";
import { selectEffort } from "./effortSelection.js";
import { rankRows, sourceMetric, barWidth } from "./ranking.js";

const profiles = [
    { id: "sonnet@max", modelId: "sonnet", name: "Sonnet", effort: "max", highest: true, boards: { aa: { value: 56 } } },
    { id: "sonnet@high", modelId: "sonnet", name: "Sonnet", effort: "high", highest: false, boards: { aa: { value: 47 } } },
    { id: "opus@max", modelId: "opus", name: "Opus", effort: "max", highest: true, boards: { aa: { value: 58 } } },
    { id: "new@unspecified", modelId: "new", name: "New", effort: "unspecified", highest: true, boards: {} },
];

test("filters exact effort without borrowing unreported or lower effort scores", () => {
    assert.equal(selectEffort(profiles, "highest").length, 3);
    assert.deepEqual(selectEffort(profiles, "max").map((m) => m.id), ["sonnet@max", "opus@max"]);
    assert.deepEqual(selectEffort(profiles, "high").map((m) => m.id), ["sonnet@high"]);
    assert.equal(selectEffort(profiles, "all").length, 4);
});

test("a source ranking uses its published score, independently of consensus rank", () => {
    const metric = sourceMetric({ id: "aa", name: "AA", metric: "Index", updated: "2026-09-29" }, "intelligence");
    assert.deepEqual(rankRows(selectEffort(profiles, "max"), metric).map((m) => m.id), ["opus@max", "sonnet@max"]);
    assert.equal(metric.get(profiles[3]), null);
    assert.equal(rankRows(profiles, metric).length, 3);
});

test("source bars support negative agent scores without negative widths", () => {
    assert.equal(barWidth(-10, [-10, 0, 10], "high"), 0);
    assert.equal(barWidth(10, [-10, 0, 10], "high"), 100);
    assert.equal(barWidth(5, [5], "low"), 0);
});

test("a low-effort profile does not inherit max speed or coding score", () => {
    const m = { id: "gpt-6-sol@low", modelId: "gpt-6-sol", name: "GPT-6 Sol", provider: "openai", effort: "low",
        score: null, speed: null, coding: null, categories: { coding: 70 }, sourceCount: 1, sources: {} };
    const mapped = fromConsensus({ generatedAt: "2026-09-29", sources: [], models: [m], profiles: [m] });
    assert.equal(mapped.MODELS[0].speed, null);
    assert.equal(mapped.MODELS[0].coding, null);
    assert.equal(mapped.MODELS[0].modelId, "gpt-6-sol");
});
