import assert from "node:assert/strict";
import test from "node:test";
import { AI_TERMINAL_LAUNCH_CONTRACT_VERSION } from "./aiTerminalProviderAdapters.mjs";
import { resolveAiTerminalLaunchPlan } from "./aiTerminalLaunchPlan.mjs";

test("resolves an immutable OpenAI Vibyra-credit launch plan", () => {
  const plan = resolveAiTerminalLaunchPlan({
    model: "openai/gpt-5.4-mini",
    billingMode: "vibyra",
    permissionMode: "standard"
  });

  assert.deepEqual(plan, {
    billingMode: "vibyra",
    providerId: "openai",
    runtimeId: "codex",
    adapterId: "responses",
    protocol: "openai-responses",
    nativeModel: "openai/gpt-5.4-mini",
    billingModel: "openai/gpt-5.4-mini",
    allowedModels: ["openai/gpt-5.4-mini"],
    permissionMode: "standard",
    sandboxMode: "workspace-write",
    launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.allowedModels), true);
});

test("maps installed official CLIs to personal-account launch plans", () => {
  const plan = resolveAiTerminalLaunchPlan({
    model: "gpt-5.4-mini",
    tokenMode: "provider",
    permissionMode: "full"
  });
  assert.equal(plan.billingMode, "provider");
  assert.equal(plan.runtimeId, "codex");
  assert.equal(plan.sandboxMode, "danger-full-access");

  const claude = resolveAiTerminalLaunchPlan({
    model: "claude-sonnet-4",
    billingMode: "provider"
  });
  const gemini = resolveAiTerminalLaunchPlan({
    model: "gemini-2.5-pro",
    billingMode: "provider"
  });
  assert.equal(claude.runtimeId, "claude");
  assert.equal(claude.providerId, "anthropic");
  assert.equal(claude.nativeModel, "claude-sonnet-4-6");
  assert.equal(claude.billingModel, "anthropic/claude-sonnet-4.6");
  assert.equal(gemini.runtimeId, "gemini");
  assert.equal(gemini.providerId, "google");
  const aliasedClaude = resolveAiTerminalLaunchPlan({
    model: "claude/claude-sonnet-4",
    billingMode: "provider"
  });
  const aliasedGemini = resolveAiTerminalLaunchPlan({
    model: "gemini/gemini-2.5-pro",
    billingMode: "provider"
  });
  assert.equal(aliasedClaude.nativeModel, "claude-sonnet-4-6");
  assert.equal(aliasedClaude.billingModel, "anthropic/claude-sonnet-4.6");
  assert.equal(aliasedGemini.nativeModel, "gemini-2.5-pro");
  assert.equal(aliasedGemini.billingModel, "google/gemini-2.5-pro");
  const fullClaude = resolveAiTerminalLaunchPlan({
    model: "claude-sonnet-4",
    billingMode: "provider",
    permissionMode: "full"
  });
  const fullGemini = resolveAiTerminalLaunchPlan({
    model: "gemini-2.5-pro",
    billingMode: "provider",
    permissionMode: "full"
  });
  assert.equal(fullClaude.sandboxMode, "danger-full-access");
  assert.equal(fullGemini.sandboxMode, "danger-full-access");
  assert.throws(
    () => resolveAiTerminalLaunchPlan({ model: "qwen/qwen3-coder", billingMode: "provider" }),
    (error) => error.code === "personal_account_not_supported"
  );
});

test("rejects direct OpenRouter billing as a terminal source", () => {
  assert.throws(
    () => resolveAiTerminalLaunchPlan({
      model: "x-ai/grok-build-0.1",
      billingMode: "openrouter",
      permissionMode: "standard"
    }),
    (error) => error.code === "invalid_billing_mode"
  );
});

test("uses each official provider's native CLI with exact Vibyra billing models", () => {
  for (const model of [
    "anthropic/claude-sonnet-4.6",
    "google/gemini-3.1-pro-preview"
  ]) {
    const plan = resolveAiTerminalLaunchPlan({ model, billingMode: "vibyra" });
    assert.equal(plan.billingMode, "vibyra");
    assert.equal(
      plan.nativeModel,
      model.startsWith("anthropic/") ? "claude-sonnet-4-6" : model.split("/")[1]
    );
  }
  const nativeCases = [
    ["qwen/qwen3-coder", "qwen", "openai-chat-completions", "openai-chat-completions", "qwen3-coder"],
    ["moonshotai/kimi-k2", "kimi", "responses", "openai-responses", "kimi-k2"],
    ["mistralai/devstral-2", "mistral", "responses", "openai-responses", "devstral-2"]
  ];
  for (const [model, runtimeId, adapterId, protocol, nativeModel] of nativeCases) {
    const plan = resolveAiTerminalLaunchPlan({ model, billingMode: "vibyra" });
    assert.equal(plan.runtimeId, runtimeId);
    assert.equal(plan.adapterId, adapterId);
    assert.equal(plan.protocol, protocol);
    assert.equal(plan.nativeModel, nativeModel);
    assert.equal(plan.billingModel, model);
    assert.deepEqual(plan.allowedModels, [model]);
  }
});

test("legacy Kimi and Mistral aliases resolve to canonical OpenRouter billing slugs", () => {
  const cases = [
    ["kimi-k2", "moonshotai/kimi-k2"],
    ["moonshot/kimi-k2", "moonshotai/kimi-k2"],
    ["devstral-2", "mistralai/devstral-2"],
    ["mistral/devstral-2", "mistralai/devstral-2"]
  ];
  for (const [model, billingModel] of cases) {
    assert.equal(
      resolveAiTerminalLaunchPlan({ model, billingMode: "vibyra" }).billingModel,
      billingModel
    );
  }
});

test("xAI models receive native Grok Build billing contracts", () => {
  const plan = resolveAiTerminalLaunchPlan({
    model: "x-ai/grok-4.20",
    billingMode: "vibyra"
  });

  assert.equal(plan.providerId, "x-ai");
  assert.equal(plan.runtimeId, "grok");
  assert.equal(plan.adapterId, "openai-chat-completions");
  assert.equal(plan.protocol, "openai-chat-completions");
  assert.equal(plan.nativeModel, "grok-4.20");
  assert.equal(plan.billingModel, "x-ai/grok-4.20");
  assert.deepEqual(plan.allowedModels, ["x-ai/grok-4.20"]);
  assert.throws(
    () => resolveAiTerminalLaunchPlan({
      model: "x-ai/grok-4.20",
      billingMode: "provider"
    }),
    (error) => error.code === "personal_account_not_supported"
  );
});

test("every provider-qualified API-only model family uses Vibyra Agent", () => {
  const models = [
    "deepseek/deepseek-v3.2",
    "google/gemma-4-31b-it",
    "meta-llama/llama-4",
    "microsoft/phi-4",
    "cohere/command-a",
    "perplexity/sonar-pro",
    "z-ai/glm-5",
    "amazon/nova-pro",
    "ai21/jamba-large",
    "ibm-granite/granite-4",
    "nvidia/nemotron-3",
    "minimax/minimax-m2",
    "tencent/hunyuan-a13b",
    "baidu/ernie-4.5",
    "bytedance-seed/seed-2",
    "groq/compound",
    "together-ai/stripedhyena",
    "fireworks-ai/llama-v3",
    "liquid-ai/lfm-2",
    "nous-research/hermes-4",
    "openrouter/auto-router"
  ];

  for (const model of models) {
    const plan = resolveAiTerminalLaunchPlan({ model, billingMode: "vibyra" });
    assert.equal(plan.runtimeId, "vibyra-agent", model);
    assert.equal(plan.nativeModel, model, model);
    assert.equal(plan.billingModel, model, model);
    assert.deepEqual(plan.allowedModels, [model], model);
  }
});

test("unqualified unknown providers and taskless Auto fail closed", () => {
  assert.throws(
    () => resolveAiTerminalLaunchPlan({ model: "deepseek-v3" }),
    (error) => error.code === "unsupported_provider"
  );
  assert.throws(
    () => resolveAiTerminalLaunchPlan({ model: "auto" }),
    (error) => error.code === "auto_task_required"
  );
  assert.throws(
    () => resolveAiTerminalLaunchPlan({ model: "auto", initialTask: "Fix tests" }),
    (error) => error.code === "auto_route_required"
  );
});

test("Auto resolves only after a task and concrete pre-launch route", () => {
  const plan = resolveAiTerminalLaunchPlan({
    model: "auto",
    initialTask: "Fix the failing test",
    routedModel: "openai/gpt-5.4-mini"
  });
  assert.equal(plan.providerId, "openai");
  assert.equal(plan.runtimeId, "codex");
  assert.equal(plan.billingModel, "openai/gpt-5.4-mini");
});

test("rejects unsafe permission, sandbox, and cross-provider model combinations", () => {
  assert.throws(
    () => resolveAiTerminalLaunchPlan({
      model: "openai/gpt-5.4-mini",
      permissionMode: "standard",
      sandboxMode: "danger-full-access"
    }),
    (error) => error.code === "unsafe_sandbox_mode"
  );
  assert.throws(
    () => resolveAiTerminalLaunchPlan({
      model: "openai/gpt-5.4-mini",
      allowedModels: ["openai/gpt-5.4-mini", "anthropic/claude-sonnet-4"]
    }),
    (error) => error.code === "provider_model_mismatch"
  );
  assert.throws(
    () => resolveAiTerminalLaunchPlan({
      model: "deepseek/deepseek-v3",
      billingModel: "deepseek/deepseek-chat",
      allowedModels: ["deepseek/deepseek-chat"]
    }),
    (error) => error.code === "exact_model_required"
  );
});
