import assert from "node:assert/strict";
import { test } from "node:test";
import { TERMINAL_RUNTIMES } from "./aiTerminalRuntimeCatalog.mjs";
import { terminalRuntimeForModel, terminalRuntimeState } from "./aiTerminalRuntimes.mjs";

test("maps official CLI models natively and API-only models to Vibyra Agent", () => {
  assert.equal(terminalRuntimeForModel("gpt-5.5"), "codex");
  assert.equal(terminalRuntimeForModel("anthropic/claude-opus-4.8"), "claude");
  assert.equal(terminalRuntimeForModel("google/gemini-3.1-pro"), "gemini");
  assert.equal(terminalRuntimeForModel("qwen/qwen3-coder"), "qwen");
  assert.equal(terminalRuntimeForModel("mistralai/devstral-2"), "mistral");
  assert.equal(terminalRuntimeForModel("moonshotai/kimi-k2"), "kimi");
  assert.equal(terminalRuntimeForModel("x-ai/grok-build-0.1"), "grok");
});

test("unknown qualified providers use Vibyra Agent while unqualified models fail closed", () => {
  assert.equal(terminalRuntimeForModel("deepseek/deepseek-v3"), "vibyra-agent");
  assert.equal(terminalRuntimeForModel("meta-llama/llama-4"), "vibyra-agent");
  assert.equal(terminalRuntimeForModel("deepseek-v3"), null);
  assert.equal(terminalRuntimeForModel("auto"), null);
  assert.equal(terminalRuntimeForModel(""), null);
});

test("runtime state separates executable availability from adapter readiness", () => {
  const state = terminalRuntimeState();
  const vibyraAgent = state.runtimes.find((runtime) => runtime.id === "vibyra-agent");
  const codex = state.runtimes.find((runtime) => runtime.id === "codex");
  const claude = state.runtimes.find((runtime) => runtime.id === "claude");
  const gemini = state.runtimes.find((runtime) => runtime.id === "gemini");

  assert.equal(vibyraAgent?.bundled, true);
  assert.equal(vibyraAgent?.available, true);
  assert.equal(vibyraAgent?.adapterReady, true);
  assert.equal(vibyraAgent?.protocol, "openai-responses");
  assert.equal(vibyraAgent?.source, "bundled");
  assert.equal(vibyraAgent?.installable, false);
  assert.equal(codex?.bundled, true);
  assert.equal(codex?.adapterReady, true);
  assert.equal(codex?.protocol, "openai-responses");
  assert.equal(codex?.ready, codex?.available);
  assert.equal(claude?.bundled, false);
  assert.equal(claude?.adapterReady, true);
  assert.equal(claude?.protocol, "anthropic-messages");
  assert.equal(claude?.ready, claude?.available);
  assert.equal(gemini?.adapterReady, true);
  assert.equal(gemini?.protocol, "gemini-generate-content");
  assert.equal(gemini?.ready, gemini?.available);
  assert.equal(Object.hasOwn(state, "providerFallback"), false);
});

test("runtime catalog exposes pinned installers and host requirements", () => {
  assert.equal(TERMINAL_RUNTIMES.mistral.installer.version, "2.14.1");
  assert.deepEqual(TERMINAL_RUNTIMES.mistral.requirements, { python: ">=3.12" });
  assert.deepEqual(TERMINAL_RUNTIMES.qwen.requirements, { node: ">=22" });
  assert.deepEqual(TERMINAL_RUNTIMES.kimi.requirements, { node: ">=22" });
  assert.equal(TERMINAL_RUNTIMES.qwen.installer.version, "0.17.1");
  assert.equal(TERMINAL_RUNTIMES.qwen.installer.nodeVersion, "22.19.0");
  assert.equal(TERMINAL_RUNTIMES.kimi.installer.version, "0.14.0");
  assert.equal(TERMINAL_RUNTIMES.kimi.installer.nodeVersion, "22.19.0");
  assert.equal(TERMINAL_RUNTIMES.mistral.installer.type, "python");
  assert.equal(TERMINAL_RUNTIMES.grok.installer.type, "xai");
  assert.equal(TERMINAL_RUNTIMES.grok.installer.version, "0.2.39");
  assert.equal(TERMINAL_RUNTIMES.grok.adapter.ready, true);
});

test("remaining official managed adapters are enabled", () => {
  const runtimes = terminalRuntimeState().runtimes;
  for (const id of ["qwen", "kimi", "mistral"]) {
    const runtime = runtimes.find((entry) => entry.id === id);
    assert.equal(runtime?.adapterReady, true);
    assert.equal(runtime?.ready, runtime?.available);
    assert.equal(runtime?.adapterReason, "");
  }
});
