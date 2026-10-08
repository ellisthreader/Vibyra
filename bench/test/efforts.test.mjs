import test from "node:test";
import assert from "node:assert/strict";
import { effortConsensus, selectRun } from "../lib/efforts.mjs";
import { checkSources } from "../lib/consensus-check.mjs";

const roster = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `M${i}` }));
const run = (value, effort, variant = effort, fallback = null) => ({ value, effort, variant, mode: "thinking", fallback });
const board = (id, category, levels = ["low", "max"]) => ({
    id, name: id, org: `fixture-${id}`, category, higherIsBetter: true, updated: "2026-09-29", url: "https://example.com", metric: "fixture",
    scores: Object.fromEntries(roster.map((m, i) => [m.id, {
        value: 100 - 8 * i, variant: "max", measurements: levels.map((level) => run(100 - 8 * i - (level === "max" ? 0 : 20), level)),
    }])),
});
const sources = [board("one", "overall"), board("two", "coding"), board("three", "agents")];

test("highest effort is chosen even when a lower effort scored better", () => {
    assert.equal(selectRun([run(99, "high"), run(85, "max")]).effort, "max");
    assert.equal(selectRun([run(99, "high"), run(85, "max")], true, "max").value, 85);
});

test("old-model fallback wins cannot displace published fallback-as-failure results", () => {
    assert.equal(selectRun([run(90, "max", "fallback", true), run(75, "max", "adjusted", false)], true, "max").value, 75);
    assert.equal(selectRun([run(99, "max", "unknown", null), run(75, "max", "known", false)], true, "max").value, 75);
});

test("effort levels use one scale; weaker low runs are not recentered to average", () => {
    const { profiles } = effortConsensus(sources, roster);
    const max = profiles.find((p) => p.id === "m3@max");
    const low = profiles.find((p) => p.id === "m3@low");
    assert.ok(max.score > low.score + 10);
    assert.equal(max.sourceCount, 3);
    assert.ok(max.highest);
    assert.equal(low.highest, false);
    const onlyMax = sources.map((s) => ({ ...s, scores: Object.fromEntries(Object.entries(s.scores).map(([id, row]) => [id, {
        ...row, measurements: row.measurements.filter((r) => r.effort === "max"),
    }])) }));
    assert.equal(effortConsensus(onlyMax, roster).profiles.find((p) => p.id === "m3@max").score, max.score);
});

test("unreported effort is separate and cannot fill missing max coverage", () => {
    const unknown = board("unknown", "knowledge", ["unspecified"]);
    const { profiles } = effortConsensus([sources[0], sources[1], unknown], roster);
    const max = profiles.find((p) => p.id === "m0@max");
    assert.equal(max.score, null);
    assert.equal(max.sourceCount, 2);
    assert.ok(!max.sources.unknown);
    assert.equal(profiles.find((p) => p.id === "m0@unspecified").sourceCount, 1);
});

test("repeated harness variants count once per board, not extra evidence", () => {
    const duplicated = structuredClone(sources);
    for (const s of duplicated) s.scores.m0.measurements.push(run(100, "max", "another harness"));
    const profile = effortConsensus(duplicated, roster).profiles.find((p) => p.id === "m0@max");
    assert.equal(profile.sourceCount, 3);
    assert.equal(Object.keys(profile.sources).length, 3);
});

test("a narrow board cannot create effort coverage or a score", () => {
    const narrow = board("narrow", "knowledge");
    narrow.scores = Object.fromEntries(Object.entries(narrow.scores).slice(0, 4));
    const result = effortConsensus([sources[0], sources[1], narrow], roster);
    assert.ok(!result.sources.some((s) => s.id === "narrow"));
    assert.equal(result.profiles.find((p) => p.id === "m0@max").score, null);
});

test("invalid effort metadata or a broken raw measurement stops publication", () => {
    const invalid = structuredClone(sources[0]);
    invalid.scores.m0.measurements.push({ value: null, variant: "bad", effort: "invented" });
    const { errors } = checkSources([invalid], roster, new Date("2026-09-29"));
    assert.ok(errors.some((x) => x.includes("invalid effort")));
    assert.ok(errors.some((x) => x.includes("no numeric value")));
});

test("invalid cost or missing cost basis stops publication", () => {
    const invalid = structuredClone(sources[0]);
    invalid.scores.m0.measurements[0].costPerTask = -1;
    assert.ok(checkSources([invalid], roster).errors.some((e) => e.includes("positive cost")));
    invalid.scores.m0.measurements[0].costPerTask = 1;
    assert.ok(checkSources([invalid], roster).errors.some((e) => e.includes("positive cost")));
    invalid.scores.m0.measurements[0].costBasis = "Published workload USD/task";
    assert.deepEqual(checkSources([invalid], roster).errors, []);
});

import { readFile } from "node:fs/promises";
test("model identity words do not masquerade as declared AA effort", async () => {
    const data = JSON.parse(await readFile(new URL("../consensus/sources/artificial-analysis.json", import.meta.url)));
    const aa = data.sources.find((s) => s.id === "aa-intelligence");
    for (const [id, name] of [["qwen3-8-max", "Qwen3.8 Max (0902)"]]) {
        const identityRun = aa.scores[id].measurements.find((r) => r.variant === name);
        assert.ok(identityRun, name);
        assert.equal(identityRun.effort, "unspecified", name);
    }
    // Mistral's brand word is not medium effort; rich owner metadata declares high.
    assert.equal(aa.scores["mistral-medium-3-5"].measurements.find((r) => r.variant === "Mistral Medium 3.5").effort, "high");
    const coding = data.sources.find((s) => s.id === "aa-coding-agent");
    assert.equal(coding.scores["glm-5-3"].measurements.find((r) => r.variant.includes("'reasoning_effort': 'max'")).effort, "max");
});
