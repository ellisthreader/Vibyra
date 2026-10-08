import test from "node:test";
import assert from "node:assert/strict";
import { MODELS } from "./data.js";
import { blended, display, frontier, ranked, topPicks } from "./metrics.js";

test("every model has the fields the charts read", () => {
    for (const m of MODELS) {
        assert.ok(m.id && m.name && m.provider, m.id);
        assert.ok(m.intelligence == null || Number.isFinite(m.intelligence), m.id);
        if (m.sourceCount != null && m.sourceCount < 3) assert.equal(m.intelligence, null, m.id);
        assert.ok(blended(m) > 0, m.id);
    }
});

test("ranking leaves out models with no value instead of ranking them last", () => {
    const coding = ranked(MODELS, "coding");
    assert.ok(coding.every((m) => m.coding != null));
    const withGap = [...MODELS.slice(0, 3), { ...MODELS[3], coding: null }];
    assert.equal(ranked(withGap, "coding").length, 3);
    assert.ok(ranked(MODELS, "price").every((m, i, all) => i === 0 || blended(all[i - 1]) <= blended(m)));
});

test("no model beats a frontier model on both price and intelligence", () => {
    for (const f of frontier(MODELS, "price", "intelligence")) {
        assert.ok(!MODELS.some((o) => blended(o) < blended(f) && o.intelligence > f.intelligence), f.id);
    }
});

test("efficient coder uses actual workload cost within its stated performance gate", () => {
    const value = topPicks(MODELS).find((p) => p.id === "value");
    const paired = MODELS.filter((m) => m.boards?.["aa-coding-agent"]?.costPerTask > 0);
    const peak = Math.max(...paired.map((m) => m.boards["aa-coding-agent"].value));
    const eligible = paired.filter((m) => m.boards["aa-coding-agent"].value >= peak - 5);
    assert.equal(value.metric, "taskCost");
    assert.equal(value.model.boards["aa-coding-agent"].costPerTask, Math.min(...eligible.map((m) => m.boards["aa-coding-agent"].costPerTask)));
});

test("approximate figures are marked", () => {
    const approx = MODELS.find((m) => m.approx?.includes("speed"));
    if (approx) assert.match(display("speed", approx), /^~/);
});


test("models awaiting sufficient scores stay available without entering rankings", () => {
    const pending = MODELS.filter((m) => m.intelligence == null);
    const ranking = ranked(MODELS, "intelligence");
    for (const model of pending) {
        assert.ok(!ranking.some((m) => m.id === model.id), model.id);
        assert.equal(display("intelligence", model), "–");
        assert.ok(blended(model) > 0, "Unranked models still have published prices");
    }
});
