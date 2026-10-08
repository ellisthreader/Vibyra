import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOpenRouterReasoning } from "../src/lib/openRouterReasoning.ts";

test("orders OpenRouter effort metadata for the slider", () => {
  const result = normalizeOpenRouterReasoning({
    supported_efforts: ["max", "xhigh", "high", "medium", "low", "none"],
    default_effort: "medium",
  });
  assert.deepEqual(result.efforts, ["none", "low", "medium", "high", "xhigh", "max"]);
  assert.equal(result.defaultEffort, "medium");
});

test("keeps vendor modes out of OpenRouter effort payloads", () => {
  const result = normalizeOpenRouterReasoning({
    supported_efforts: ["max", "ultra", "ultracode", "low"],
  });
  assert.deepEqual(result.efforts, ["low", "max"]);
});

test("removes the disable stop from mandatory reasoning models", () => {
  const result = normalizeOpenRouterReasoning({
    mandatory: true,
    supported_efforts: null,
    default_effort: "high",
  });
  assert.deepEqual(result.efforts, ["minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.equal(result.defaultEffort, "high");
});

test("does not invent a selector when supported efforts are omitted", () => {
  assert.deepEqual(normalizeOpenRouterReasoning({ mandatory: false }).efforts, []);
});
