import test from "node:test";
import assert from "node:assert/strict";
import { summarise, CATEGORY_WEIGHTS } from "../lib/consensus.mjs";
import { EVIDENCE_POLICY, evaluatorSensitivity } from "../lib/evidence.mjs";
import { effortConsensus } from "../lib/efforts.mjs";

const point = (source, org, category, x, family = source) => ({ source, org, category, x, family });
const base = [point("a", "A", "overall", 1), point("b", "B", "coding", 2), point("c", "C", "reasoning", 3)];
const summary = (points) => summarise(points, CATEGORY_WEIGHTS, EVIDENCE_POLICY);

test("more boards from one evaluator cannot outvote another within a category", () => {
    const points = [...base, point("d", "D", "coding", 0)];
    const before = summary(points);
    const after = summary([...points, point("copy", "B", "coding", 2)]);
    assert.equal(before.theta, after.theta);
    assert.equal(after.categories.coding, 1);
});

test("a family with more published variants has only one vote inside its evaluator", () => {
    const points = [point("one", "A", "coding", 1, "family"), point("two", "A", "coding", 3, "family"),
        point("different", "A", "coding", 0, "different")];
    assert.equal(summary(points).categories.coding, 1);
});

test("preference is inspectable but cannot inflate a capability score", () => {
    const result = summary([...base, point("preference", "D", "preference", 100)]);
    assert.equal(result.theta, summary(base).theta);
    assert.equal(result.categories.preference, 100);
    assert.equal(result.orgs, 3);
    assert.equal(result.sources, 3);
});

test("three correlated boards cannot satisfy independent evidence or category coverage", () => {
    assert.equal(summary(base.map((p) => ({ ...p, org: "same" }))).theta, null);
    assert.equal(summary(base.map((p) => ({ ...p, category: "coding" }))).theta, null);
    assert.equal(summary(base).theta, 2);
});

test("evaluator sensitivity uses the fixed scale and flags incomplete comparisons", () => {
    const points = [...base, point("d", "D", "overall", 2), point("e", "E", "coding", 3), point("f", "F", "reasoning", 4)];
    const range = evaluatorSensitivity(points);
    assert.ok(range.low <= range.high);
    assert.equal(range.scenarios.length, 6);
    assert.equal(range.incomplete, false);
    assert.equal(evaluatorSensitivity(base).incomplete, true);
});

test("reference-only boards remain inspectable without altering scores or calibration", () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}` }));
    const board = (id, category) => ({ id, org: id, category, scores: Object.fromEntries(roster.map((m, i) => [m.id,
        { value: 100 - i * 10, measurements: [{ value: 100 - i * 10, effort: "max", variant: "max" }] }])) });
    const sources = [board("A", "overall"), board("B", "coding"), board("C", "reasoning")];
    const reference = { ...board("reference", "knowledge"), consensus: false };
    const a = effortConsensus(sources, roster).profiles[0];
    const b = effortConsensus([...sources, reference], roster).profiles[0];
    assert.equal(a.score, b.score);
    assert.equal(b.publishedCount, 4);
    assert.equal(b.sourceCount, 3);
    assert.equal(b.sources.reference.normalised, null);
});

test("identical evaluator estimates are strong agreement, not fallback unit spread", () => {
    assert.equal(summary(base.map((p) => ({ ...p, x: 1 }))).spread, 0);
});
