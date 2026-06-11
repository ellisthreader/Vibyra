import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_TERMINAL_LAUNCH_CONTRACT_VERSION,
  AI_TERMINAL_PROVIDER_ADAPTERS,
  terminalProviderAdapterForModel,
  terminalProviderIdForModel
} from "./aiTerminalProviderAdapters.mjs";

test("maps official CLI families natively and API-only families to Vibyra Agent", () => {
  const cases = [
    ["openai/gpt-5.4-mini", "openai", "codex", "responses", "openai-responses"],
    ["anthropic/claude-sonnet-4", "anthropic", "claude", "anthropic-messages", "anthropic-messages"],
    ["google/gemini-3.1-pro", "google", "gemini", "gemini-generate-content", "gemini-generate-content"],
    ["qwen/qwen3-coder", "qwen", "qwen", "openai-chat-completions", "openai-chat-completions"],
    ["moonshotai/kimi-k2", "moonshot", "kimi", "responses", "openai-responses"],
    ["mistralai/devstral-2", "mistral", "mistral", "responses", "openai-responses"],
    ["x-ai/grok-build-0.1", "x-ai", "grok", "openai-chat-completions", "openai-chat-completions"]
  ];

  for (const [model, providerId, runtimeId, adapterId, protocol] of cases) {
    const adapter = terminalProviderAdapterForModel(model);
    assert.equal(terminalProviderIdForModel(model), providerId);
    assert.equal(adapter?.runtimeId, runtimeId);
    assert.equal(adapter?.adapterId, adapterId);
    assert.equal(adapter?.protocol, protocol);
  }
});

test("keeps managed-credit readiness separate from native personal accounts", () => {
  assert.equal(AI_TERMINAL_PROVIDER_ADAPTERS.openai.managedCreditsReady, true);
  assert.equal(AI_TERMINAL_PROVIDER_ADAPTERS.openai.personalAccountReady, true);
  for (const providerId of ["anthropic", "google"]) {
    assert.equal(AI_TERMINAL_PROVIDER_ADAPTERS[providerId].managedCreditsReady, true);
    assert.equal(AI_TERMINAL_PROVIDER_ADAPTERS[providerId].personalAccountReady, true);
  }
  for (const providerId of ["qwen", "moonshot", "mistral", "x-ai"]) {
    assert.equal(AI_TERMINAL_PROVIDER_ADAPTERS[providerId].managedCreditsReady, true);
    assert.equal(AI_TERMINAL_PROVIDER_ADAPTERS[providerId].personalAccountReady, false);
  }
});

test("advertises full access for every runtime with a native bypass launch mode", () => {
  assert.deepEqual(AI_TERMINAL_PROVIDER_ADAPTERS.openai.permissionModes, ["standard", "full"]);
  assert.deepEqual(AI_TERMINAL_PROVIDER_ADAPTERS.anthropic.permissionModes, ["standard", "full"]);
  assert.deepEqual(AI_TERMINAL_PROVIDER_ADAPTERS.google.permissionModes, ["standard", "full"]);
  assert.deepEqual(AI_TERMINAL_PROVIDER_ADAPTERS.qwen.permissionModes, ["standard", "full"]);
});

test("unknown qualified providers use an exact dynamic Vibyra Agent adapter", () => {
  const adapter = terminalProviderAdapterForModel("DeepSeek/DeepSeek-V3");

  assert.equal(terminalProviderIdForModel("DeepSeek/DeepSeek-V3"), "deepseek");
  assert.deepEqual(adapter, {
    providerId: "deepseek",
    aliases: ["deepseek"],
    runtimeId: "vibyra-agent",
    adapterId: "responses",
    protocol: "openai-responses",
    managedCreditsReady: true,
    personalAccountReady: false,
    modelPrefixes: [],
    billingModes: ["vibyra"],
    permissionModes: ["standard", "full"],
    sandboxModes: ["read-only", "workspace-write", "danger-full-access"]
  });
  assert.equal(Object.isFrozen(adapter), true);
});

test("API-only model families from native CLI companies still use Vibyra Agent", () => {
  const adapter = terminalProviderAdapterForModel("google/gemma-4-31b-it");

  assert.equal(terminalProviderIdForModel("google/gemma-4-31b-it"), "google");
  assert.equal(adapter?.providerId, "google");
  assert.equal(adapter?.runtimeId, "vibyra-agent");
  assert.equal(adapter?.managedCreditsReady, true);
  assert.equal(adapter?.personalAccountReady, false);
});

test("official CLI providers never fall through to Vibyra Agent", () => {
  for (const model of [
    "openai/gpt-5.4-mini",
    "anthropic/claude-sonnet-4",
    "google/gemini-3.1-pro",
    "qwen/qwen3-coder",
    "moonshotai/kimi-k2",
    "mistralai/devstral-2",
    "x-ai/grok-build-0.1"
  ]) {
    assert.notEqual(terminalProviderAdapterForModel(model)?.runtimeId, "vibyra-agent");
  }
});

test("unregistered API-only providers use Vibyra Agent", () => {
  assert.equal(
    terminalProviderAdapterForModel("deepseek/deepseek-v3")?.runtimeId,
    "vibyra-agent"
  );
});

test("unqualified unknown models and Auto have no adapter", () => {
  assert.equal(terminalProviderIdForModel("deepseek-v3"), "");
  assert.equal(terminalProviderAdapterForModel("deepseek-v3"), null);
  assert.equal(terminalProviderAdapterForModel("auto"), null);
});

test("registry and nested definitions are immutable", () => {
  assert.equal(AI_TERMINAL_LAUNCH_CONTRACT_VERSION, 25);
  assert.equal(Object.isFrozen(AI_TERMINAL_PROVIDER_ADAPTERS), true);
  assert.equal(Object.isFrozen(AI_TERMINAL_PROVIDER_ADAPTERS.openai), true);
  assert.equal(Object.isFrozen(AI_TERMINAL_PROVIDER_ADAPTERS.openai.aliases), true);
});
