import assert from "node:assert/strict";
import test from "node:test";

import { planRunner } from "../src/lib/modelRunners.ts";

function model(id, company, label = id) {
  return {
    id,
    label,
    company,
    contextLength: 200_000,
    tier: "premium",
    isNew: false,
    score: 0,
    created: 0,
    supportsReasoning: false,
    reasoningEfforts: [],
    defaultReasoningEffort: null,
    reasoningMandatory: false,
  };
}

function agent(id, installed = true) {
  return {
    id,
    name: id,
    program: id,
    args: [],
    env: [],
    accent: "#fff",
    description: "",
    custom: false,
    installed,
  };
}

test("requires a native integration to be explicitly selected", () => {
  const gpt = model("openai/gpt-5.6-sol", "OpenAI", "GPT-5.6 Sol");
  const agents = [agent("codex")];
  assert.match(planRunner(gpt, agents, []).blocked, /Enable codex/i);
  assert.equal(planRunner(gpt, agents, ["codex"]).runner?.id, "codex");
});

test("requires the selected native integration to be installed", () => {
  const claude = model("anthropic/claude-sonnet-5", "Anthropic", "Claude Sonnet 5");
  assert.match(planRunner(claude, [agent("claude", false)], ["claude"]).blocked, /Install/);
});

test("generic OpenRouter models use only selected integrations", () => {
  const deepseek = model("deepseek/deepseek-chat", "DeepSeek", "DeepSeek Chat");
  const agents = [agent("aider"), agent("opencode")];
  assert.match(planRunner(deepseek, agents, []).blocked, /Enable Aider or OpenCode/);
  assert.equal(planRunner(deepseek, agents, ["opencode"]).runner?.id, "opencode");
});

test("unverified provider-catalog variants do not route through account CLIs", () => {
  const variant = model("anthropic/claude-opus-5:extended", "Anthropic", "Claude Opus 5 Extended");
  const agents = [agent("claude"), agent("aider")];
  assert.match(planRunner(variant, agents, ["claude"]).blocked, /Aider or OpenCode/);
  const plan = planRunner(variant, agents, ["claude", "aider"]);
  assert.equal(plan.runner?.id, "aider");
  assert.equal(plan.launchModel, "openrouter/anthropic/claude-opus-5:extended");
});
