import assert from "node:assert/strict";
import test from "node:test";

import { modelEffortOptions, resolvedModelEffort } from "../src/lib/modelEffort.ts";

function model(overrides) {
  return {
    id: "openai/gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    company: "OpenAI",
    reasoningEfforts: [],
    defaultReasoningEffort: null,
    ...overrides,
  };
}

function values(options) {
  return options.map(({ value }) => value);
}

test("keeps Codex Ultra as a native CLI-only effort", () => {
  assert.deepEqual(values(modelEffortOptions(model({}), "codex")), [
    "low", "medium", "high", "xhigh", "max", "ultra",
  ]);
});

test("uses OpenRouter's exact Claude effort subset", () => {
  const fable = model({
    id: "anthropic/claude-fable-5",
    company: "Anthropic",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "high",
  });
  assert.deepEqual(values(modelEffortOptions(fable, "claude")), [
    "low", "medium", "high", "xhigh", "max", "ultracode",
  ]);
  assert.equal(resolvedModelEffort(fable, "claude", "ultracode"), "ultracode");
});

test("does not add xhigh to a model when OpenRouter omits it", () => {
  const sonnet = model({
    id: "anthropic/claude-sonnet-4.6",
    company: "Anthropic",
    reasoningEfforts: ["low", "medium", "high", "max"],
  });
  assert.deepEqual(values(modelEffortOptions(sonnet, "claude")), [
    "low", "medium", "high", "max",
  ]);
});

test("offers Ultracode on every supported offline Claude family", () => {
  const supported = [
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-opus-4.8",
    "claude-opus-4.7",
  ];
  for (const id of supported) {
    const claude = model({ id: `anthropic/${id}`, company: "Anthropic" });
    assert.equal(values(modelEffortOptions(claude, "claude")).at(-1), "ultracode", id);
  }
});

test("keeps Ultracode off Claude families without xhigh", () => {
  const unsupported = [
    "claude-opus-4.6",
    "claude-sonnet-4.6",
    "claude-opus-4.5",
    "claude-haiku-4.5",
  ];
  for (const id of unsupported) {
    const claude = model({ id: `anthropic/${id}`, company: "Anthropic" });
    assert.equal(values(modelEffortOptions(claude, "claude")).includes("ultracode"), false, id);
  }
});
