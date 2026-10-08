import test from "node:test";
import assert from "node:assert/strict";
import { ALL_MODELS } from "./data.js";
import { pairedRows, paretoRanks, dominates, efficientCoder } from "./costPerformance.js";

const row = (id, performance, cost) => ({ model: { id }, performance, cost });
const model = (id, value, costPerTask, extra = {}) => ({ id, boards: { "aa-coding-agent": { value, costPerTask, ...extra } } });

test("Pareto tiers retain performance/cost tradeoffs and exact ties", () => {
    const rows = paretoRanks([row("strong", 95, 10), row("cheap", 75, 1), row("dominated", 70, 2), row("tie", 95, 10), row("third", 60, 3)]);
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.model.id, r.tier])), { strong: 1, tie: 1, cheap: 1, dominated: 2, third: 3 });
    assert.equal(dominates(rows[0], rows[1]), false);
});

test("paired comparisons omit missing, estimated or invalid costs without price proxies", () => {
    const models = [model("valid", 80, 2), model("missing", 90, null), model("zero", 90, 0), model("negative", 90, -1),
        model("estimate", 90, 1, { costEligible: false }), { id: "token-price-only", intelligence: 95, priceIn: .01, priceOut: .02 }];
    assert.deepEqual(pairedRows(models, "aa-coding-agent").map((r) => r.model.id), ["valid"]);
    assert.deepEqual(pairedRows(models, "other-workload"), []);
});

test("value tiers are invariant to the arbitrary origin and scale of a capability index", () => {
    const rows = [row("a", 70, 5), row("b", 60, 1), row("c", 50, 2)];
    const tiers = (items) => paretoRanks(items).map((r) => [r.model.id, r.tier]);
    assert.deepEqual(tiers(rows), tiers(rows.map((r) => ({ ...r, performance: 15 * r.performance - 900 }))));
});

test("efficient coder gates performance before minimizing workload spend", () => {
    const models = [model("leader", 90, 10), model("value", 85, 3), model("weak", 84.99, .01), model("estimate", 99, .001, { costEligible: false })];
    assert.equal(efficientCoder(models).model.id, "value");
    assert.equal(efficientCoder([]), null);
});

test("current exact max workload evidence preserves evaluator tradeoffs", () => {
    const max = ALL_MODELS.filter((m) => m.effort === "max");
    const pair = (sourceId) => {
        const rows = pairedRows(max, sourceId);
        return [rows.find((r) => r.model.modelId === "claude-sonnet-5-5"), rows.find((r) => r.model.modelId === "claude-fable-5-1")];
    };
    for (const sourceId of ["aa-intelligence", "vals-terminal-bench-4", "vals-vibe-code-bench", "vals-proofbench"]) {
        const [sonnet, fable] = pair(sourceId);
        assert.ok(dominates(sonnet, fable), sourceId);
    }
    const [sonnet, fable] = pair("aa-coding-agent");
    assert.ok(sonnet.performance > fable.performance && sonnet.cost > fable.cost);
    assert.equal(dominates(sonnet, fable), false);
    assert.match(pair("vals-terminal-bench-4")[0].run.costBasis, /includes fallback/);
});

test("selected profile costs match an exact published measurement, without cross-effort borrowing", () => {
    for (const m of ALL_MODELS) for (const run of Object.values(m.boards ?? {})) {
        if (run.costPerTask == null) continue;
        assert.ok(run.measurements.some((raw) => raw.effort === m.effort && raw.variant === run.variant && raw.value === run.value && raw.costPerTask === run.costPerTask), m.id);
        assert.ok(run.costBasis && Number.isFinite(run.costPerTask) && run.costPerTask > 0, m.id);
    }
});
