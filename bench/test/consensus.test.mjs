import test from "node:test";
import assert from "node:assert/strict";
import { consensus, toScore } from "../lib/consensus.mjs";

const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
const truth = { a: 2, b: 1.5, c: 1, d: 0.5, e: 0, f: -0.5, g: -1, h: -1.5 };
const src = (id, category, covered, scale, offset, higherIsBetter = true) => ({
    id, category, higherIsBetter,
    scores: Object.fromEntries(covered.map((m) => [m, { value: (higherIsBetter ? 1 : -1) * truth[m] * scale + offset }])),
});

test("recovers the true order from sources on different scales and coverage", () => {
    const sources = [
        src("elo", "preference", ids, 60, 1400),
        src("pct", "coding", ids.slice(0, 6), 12, 50),
        src("top-only", "overall", ["a", "b", "c", "d", "e"], 5, 40),
        src("cost", "overall", ids.slice(2), 3, 10, false),
        src("reasoning", "reasoning", ids.slice(0, 6), 8, 30),
    ];
    const out = consensus(sources, ids);
    const order = ids.filter((m) => out.models[m].theta != null).sort((x, y) => out.models[y].theta - out.models[x].theta);
    // g and h appear in only two sources, so they get no score at all.
    assert.deepEqual(order, ["a", "b", "c", "d", "e", "f"]);
});

test("a board that only covers top models does not drag them to average", () => {
    const sources = [
        src("broad1", "overall", ids, 10, 50),
        src("broad2", "coding", ids, 8, 30),
        src("top-only", "reasoning", ["a", "b", "c", "d", "e"], 5, 60),
    ];
    const out = consensus(sources, ids);
    const topOnly = out.models.a.points.find((p) => p.source === "top-only").x;
    const broad = out.models.a.points.find((p) => p.source === "broad1").x;
    assert.ok(Math.abs(topOnly - broad) < 0.25, `${topOnly} vs ${broad}`);
});

test("too few sources means no score, not a guess", () => {
    const sources = [src("one", "overall", ids, 10, 50), src("two", "coding", ids.slice(0, 5), 10, 50)];
    const out = consensus(sources, ids);
    assert.equal(out.models.h.theta, null);
    assert.equal(toScore(null), null);
    assert.equal(toScore(0), 50);
});

import { checkSources } from "../lib/consensus-check.mjs";

test("source checks catch bad ids, broken numbers, duplicates and stale boards", () => {
    const roster = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const base = { name: "N", org: "O", url: "u", metric: "m", category: "overall", updated: "2026-09-20" };
    const { errors, warnings } = checkSources([
        { ...base, id: "s1", scores: { a: { value: 1 }, zz: { value: 2 } } },
        { ...base, id: "s1", scores: { b: { value: "x" } } },
        { ...base, id: "old", updated: "2026-01-01", scores: { a: { value: 3 } } },
    ], roster, new Date("2026-09-23"));
    assert.ok(errors.some((e) => e.includes('unknown model id "zz"')));
    assert.ok(errors.some((e) => e.includes("duplicate source id")));
    assert.ok(errors.some((e) => e.includes("b has no numeric value")));
    assert.ok(warnings.some((w) => w.startsWith("old: last updated")));
    assert.ok(warnings.some((w) => w.startsWith("B: only 1")));
});
