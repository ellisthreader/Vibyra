import test from "node:test";
import assert from "node:assert/strict";
import { MODELS } from "./data.js";
import { blended, display, frontier, ranked, topPicks } from "./metrics.js";

test("every model has the fields the charts read", () => {
    for (const m of MODELS) {
        assert.ok(m.id && m.name && m.provider, m.id);
        assert.equal(typeof m.intelligence, "number", m.id);
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

test("best value is a different, cheaper model than the smartest", () => {
    const [smartest, , value] = topPicks(MODELS);
    assert.notEqual(value.model.id, smartest.model.id);
    assert.ok(blended(value.model) < blended(smartest.model));
    assert.ok(value.model.intelligence >= smartest.model.intelligence * 0.8);
});

test("approximate figures are marked", () => {
    const approx = MODELS.find((m) => m.approx?.includes("speed"));
    if (approx) assert.match(display("speed", approx), /^~/);
});
