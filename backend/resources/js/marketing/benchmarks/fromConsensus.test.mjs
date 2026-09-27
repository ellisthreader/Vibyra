import test from "node:test";
import assert from "node:assert/strict";
import { fromConsensus } from "./fromConsensus.js";

test("a brand-new model shows its own name, provider and live price", () => {
    const doc = {
        generatedAt: "2026-10-01T00:00:00Z",
        sources: [{ id: "s", name: "S", org: "O", url: "u", metric: "m", category: "overall", updated: "2026-10-01", models: 5 }],
        models: [{ id: "brand-new", name: "Brand New 1", provider: "openai", openWeights: false, priceIn: 1, priceOut: 4,
            context: 200000, score: 61, categories: { overall: 61 }, sourceCount: 3, agreement: "fair", provisional: true, sources: {} }],
    };
    const [m] = fromConsensus(doc).MODELS;
    assert.equal(m.name, "Brand New 1");
    assert.equal(m.provider, "openai");
    assert.equal(m.priceIn, 1);
    assert.equal(m.blended, null);
    assert.equal(m.provisional, true);
});
