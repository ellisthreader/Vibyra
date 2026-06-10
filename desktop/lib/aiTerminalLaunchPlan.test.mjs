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
  assert.throws(
    () => resolveAiTerminalLaunchPlan({ model: "qwen/qwen3-coder", billingMode: "provider" }),
    (error) => error.code === "personal_account_not_supported"
  );
});

test("uses native billed Claude and Gemini mappings and Vibyra Agent for API-only providers", () => {
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
  for (const model of [
    "qwen/qwen3-coder",
    "moonshotai/kimi-k2",
    "mistralai/devstral-2"
  ]) {
    const plan = resolveAiTerminalLaunchPlan({ model, billingMode: "vibyra" });
    assert.equal(plan.runtimeId, "vibyra-agent");
    assert.equal(plan.nativeModel, model);
    assert.equal(plan.billingModel, model);
    assert.deepEqual(plan.allowedModels, [model]);
  }
});

test("unknown qualified providers receive exact Vibyra Agent billing contracts", () => {
  const plan = resolveAiTerminalLaunchPlan({
    model: "x-ai/grok-4.20",
    billingMode: "vibyra"
  });

  assert.equal(plan.providerId, "x-ai");
  assert.equal(plan.runtimeId, "vibyra-agent");
  assert.equal(plan.adapterId, "responses");
  assert.equal(plan.protocol, "openai-responses");
  assert.equal(plan.nativeModel, "x-ai/grok-4.20");
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
    "x-ai/grok-4.20",
    "deepseek/deepseek-v3.2",
    "qwen/qwen3-coder",
    "moonshotai/kimi-k2",
    "mistralai/devstral-2",
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
