import assert from "node:assert/strict";
import test from "node:test";

import { seedCuratedModels } from "../src/lib/catalogSeed.ts";

function live(id, label, contextLength = 1_000_000) {
  return {
    id,
    label,
    company: "Anthropic",
    contextLength,
    tier: "premium",
    isNew: false,
    score: 5,
    created: 1,
    supportsReasoning: true,
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "high",
    reasoningMandatory: false,
  };
}

function seeded(models) {
  const byCompany = new Map([["Anthropic", models]]);
  seedCuratedModels(byCompany);
  return byCompany.get("Anthropic");
}

test("a curated model OpenRouter has not listed yet still reaches the picker", () => {
  const models = seeded([live("anthropic/claude-fable-5", "Claude Fable 5")]);
  const ids = models.map((model) => model.id);
  assert.ok(ids.includes("anthropic/claude-fable-5.1"), `5.1 missing from ${ids}`);
  assert.ok(ids.includes("anthropic/claude-fable-5"), "the live entry must survive seeding");
});

test("a model OpenRouter does list is left exactly as the catalog gave it", () => {
  const listed = live("anthropic/claude-fable-5.1", "Claude Fable 5.1");
  const models = seeded([listed]);
  assert.equal(models.filter((m) => m.id === "anthropic/claude-fable-5.1").length, 1);
  assert.equal(models.find((m) => m.id === "anthropic/claude-fable-5.1").contextLength, 1_000_000);
});

test("a seeded model never invents a context length", () => {
  const models = seeded([live("anthropic/claude-fable-5", "Claude Fable 5")]);
  const fable51 = models.find((model) => model.id === "anthropic/claude-fable-5.1");
  assert.equal(fable51.contextLength, 0);
  assert.ok(fable51.score > 0, "a seeded model must rank by the same quality function");
});

test("a company OpenRouter did not return is left to the static fallback", () => {
  const byCompany = new Map([["Anthropic", [live("anthropic/claude-fable-5", "Claude Fable 5")]]]);
  seedCuratedModels(byCompany);
  assert.equal(byCompany.has("OpenAI"), false);
});

test("only models an account CLI is known to accept are seeded", () => {
  const models = seeded([live("anthropic/claude-fable-5", "Claude Fable 5")]);
  for (const model of models) {
    assert.match(model.id, /^anthropic\//);
  }
});
