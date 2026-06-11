import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function runtimeContext() {
  const context = {
    currentPage: "",
    document: {},
    escapeAttribute: String,
    escapeHtml: String,
    fetch: async () => ({ ok: true, json: async () => ({ runtimes: [] }) }),
    icon: () => "<svg></svg>",
    render() {},
    setTimeout() {},
    terminalProviderKeyForModel(model) { return model.provider || ""; },
    window: { addEventListener() {} }
  };
  vm.createContext(context);
  vm.runInContext(
    readFileSync(new URL("./app.terminals-runtimes.js", import.meta.url), "utf8"),
    context
  );
  return context;
}

test("native runtime mapping covers supported provider CLIs", () => {
  const context = runtimeContext();
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "gpt-5.5", provider: "openai" })', context), "codex");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "claude-opus-4", provider: "claude" })', context), "claude");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "google/gemini-pro", provider: "gemini" })', context), "gemini");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "google/gemma-4-31b-it", provider: "gemini" })', context), "");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "qwen/qwen3", provider: "qwen" })', context), "qwen");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "moonshotai/kimi-k2", provider: "moonshot" })', context), "kimi");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "mistralai/devstral-2", provider: "mistral" })', context), "mistral");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "x-ai/grok-build-0.1", provider: "x-ai" })', context), "grok");
  assert.equal(vm.runInContext('terminalNativeRuntimeForModel({ key: "deepseek/v3", provider: "deepseek" })', context), "");
});

test("Vibyra credits use native CLIs when mapped and Vibyra Agent otherwise", () => {
  const context = runtimeContext();
  assert.equal(
    vm.runInContext('terminalExecutionRuntimeForModel({ key: "google/gemini-pro", provider: "gemini" }, "vibyra")', context),
    "gemini"
  );
  assert.equal(
    vm.runInContext('terminalExecutionRuntimeForModel({ key: "qwen/qwen3", provider: "qwen" }, "vibyra")', context),
    "qwen"
  );
  assert.equal(
    vm.runInContext('terminalExecutionRuntimeForModel({ key: "x-ai/grok-build-0.1", provider: "x-ai" }, "vibyra")', context),
    "grok"
  );
  assert.equal(
    vm.runInContext('terminalExecutionRuntimeForModel({ key: "deepseek/v3", provider: "deepseek" }, "vibyra")', context),
    "vibyra-agent"
  );
  assert.equal(
    vm.runInContext('terminalExecutionRuntimeForModel({ key: "google/gemma-4-31b-it", provider: "gemini" }, "vibyra")', context),
    "vibyra-agent"
  );
});

test("missing official CLIs expose a quiet icon-only download control", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [
        { id: "codex", label: "Codex CLI", available: true, adapterReady: true },
        { id: "qwen", label: "Qwen Code", available: false, adapterReady: true }
      ],
      providerFallback: null
    };
  `, context);

  const ready = vm.runInContext(
    'terminalModelCliControl({ key: "gpt-5.5", provider: "openai" }, "vibyra")',
    context
  );
  const qwen = vm.runInContext(
    'terminalModelCliControl({ key: "qwen/qwen3", provider: "qwen" }, "vibyra")',
    context
  );

  assert.equal(ready, "");
  assert.match(qwen, /data-terminal-runtime-install="qwen"/);
  assert.doesNotMatch(qwen, />Download<|Native CLI|Vibyra Agent/);
});

test("official CLI downloads expose an installing spinner", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "qwen", label: "Qwen Code", available: false, adapterReady: true }]
    };
    terminalRuntimeInstalling.add("qwen");
  `, context);

  const qwen = vm.runInContext(
    'terminalModelCliControl({ key: "qwen/qwen3", provider: "qwen" }, "vibyra")',
    context
  );
  assert.match(qwen, /terminal-model-download-spinner/);
  assert.match(qwen, /aria-busy="true"/);

  const source = readFileSync(new URL("./app.terminals-runtimes.js", import.meta.url), "utf8");
  assert.match(source, /controller\.abort\(\), 300_000/);
  assert.match(source, /The CLI download timed out/);
});

test("Grok exposes the official CLI download instead of Vibyra Agent", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "grok", label: "Grok Build", available: false, adapterReady: true, installable: true }]
    };
  `, context);

  const control = vm.runInContext(
    'terminalModelCliControl({ key: "x-ai/grok-build-0.1", provider: "x-ai" }, "vibyra")',
    context
  );
  assert.match(control, /data-terminal-runtime-install="grok"/);
  assert.doesNotMatch(control, /Vibyra Agent/);
});

test("installable runtimes use icon-only download and downloading controls", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "claude", label: "Claude Code", available: false, adapterReady: true, installable: true }]
    };
  `, context);

  const download = vm.runInContext(
    'terminalModelCliControl({ key: "anthropic/claude-opus-4", provider: "anthropic" }, "vibyra")',
    context
  );
  assert.match(download, /data-terminal-runtime-install="claude"/);
  assert.match(download, /<svg><\/svg>/);
  assert.doesNotMatch(download, />Download<|Native CLI|Vibyra Agent/);

  vm.runInContext('terminalRuntimeInstalling.add("claude")', context);
  const downloading = vm.runInContext(
    'terminalModelCliControl({ key: "anthropic/claude-opus-4", provider: "anthropic" }, "vibyra")',
    context
  );
  assert.match(downloading, /aria-busy="true"/);
  assert.match(downloading, /terminal-model-download-spinner/);
  assert.doesNotMatch(downloading, />Downloading<|Native CLI|Vibyra Agent/);
});

test("Auto opens blank with Vibyra tokens and rejects personal-account routing", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "codex", label: "Codex CLI", available: true, adapterReady: true }]
    };
  `, context);

  assert.equal(
    vm.runInContext(
      'terminalRuntimeLaunchIssueForRequest({ key: "auto", provider: "auto" }, "vibyra", "")',
      context
    ),
    ""
  );
  assert.equal(
    vm.runInContext(
      'terminalRuntimeLaunchIssueForRequest({ key: "auto", provider: "auto" }, "vibyra", "Fix the failing tests")',
      context
    ),
    ""
  );
  assert.match(
    vm.runInContext(
      'terminalRuntimeLaunchIssueForRequest({ key: "auto", provider: "auto" }, "provider", "Fix the failing tests")',
      context
    ),
    /only available with Vibyra tokens/
  );
});

test("Vibyra credits expose Qwen Code instead of a synthetic agent", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [
        { id: "codex", label: "Codex CLI", available: true, adapterReady: true },
        { id: "qwen", label: "Qwen Code", available: false, adapterReady: true }
      ],
      providerFallback: null
    };
  `, context);

  const control = vm.runInContext(
    'terminalModelCliControl({ key: "qwen/qwen3", provider: "qwen" }, "vibyra")',
    context
  );
  assert.match(control, /data-terminal-runtime-install="qwen"/);
  assert.doesNotMatch(control, /codex/i);
  assert.doesNotMatch(control, /Vibyra Agent/);
});

test("adapter failures use one quiet unavailable state instead of an install action", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [
        {
          id: "claude",
          label: "Claude Code",
          available: true,
          adapterReady: false,
          adapterIssue: "Claude billing adapter is temporarily unavailable."
        }
      ]
    };
  `, context);

  const issue = vm.runInContext(
    'terminalRuntimeLaunchIssue({ key: "anthropic/claude-opus-4", provider: "anthropic" }, "vibyra")',
    context
  );
  const control = vm.runInContext(
    'terminalModelCliControl({ key: "anthropic/claude-opus-4", provider: "anthropic" }, "vibyra")',
    context
  );
  const picker = vm.runInContext(
    'terminalRuntimePickerState({ key: "anthropic/claude-opus-4", provider: "anthropic" }, "vibyra")',
    context
  );
  assert.equal(issue, "Claude billing adapter is temporarily unavailable.");
  assert.equal(control, "");
  assert.equal(picker.issue, "Claude billing adapter is temporarily unavailable.");
  assert.equal(picker.surface, "unavailable");
  assert.doesNotMatch(control, /data-terminal-runtime-install|>Download</);
});

test("missing adapter readiness metadata fails closed", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "gemini", label: "Gemini CLI", available: true }]
    };
  `, context);

  assert.match(
    vm.runInContext(
      'terminalRuntimeLaunchIssue({ key: "google/gemini-pro", provider: "google" }, "vibyra")',
      context
    ),
    /not available with Vibyra credits yet/
  );
});

test("API-only providers use bundled Vibyra Agent while Auto stays a routing surface", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "codex", label: "Codex CLI", available: true, adapterReady: true }]
    };
  `, context);

  assert.equal(
    vm.runInContext('terminalExecutionRuntimeForModel({ key: "deepseek/v3", provider: "deepseek" }, "vibyra")', context),
    "vibyra-agent"
  );
  assert.equal(
    vm.runInContext('terminalRuntimeLaunchIssue({ key: "deepseek/v3", provider: "deepseek" }, "vibyra")', context),
    ""
  );
  assert.equal(
    vm.runInContext('terminalModelCliControl({ key: "deepseek/v3", provider: "deepseek" }, "vibyra")', context),
    ""
  );
  assert.equal(
    vm.runInContext('terminalRuntimeLaunchIssue({ key: "auto", provider: "auto" }, "vibyra")', context),
    ""
  );
  assert.equal(
    vm.runInContext('terminalModelCliControl({ key: "auto", provider: "auto" }, "vibyra")', context),
    ""
  );
});

test("personal accounts never route API-only providers through a different CLI", () => {
  const context = runtimeContext();
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "codex", label: "Codex CLI", available: true }]
    };
  `, context);

  assert.equal(
    vm.runInContext('terminalExecutionRuntimeForModel({ key: "deepseek/v3", provider: "deepseek" }, "provider")', context),
    ""
  );
  assert.match(
    vm.runInContext('terminalRuntimeLaunchIssue({ key: "deepseek/v3", provider: "deepseek" }, "provider")', context),
    /only available with Vibyra tokens/
  );
  assert.equal(
    vm.runInContext('terminalModelCliControl({ key: "deepseek/v3", provider: "deepseek" }, "provider")', context),
    ""
  );
});

test("runtime downloads refresh an open model picker without closing it", () => {
  const source = readFileSync(new URL("./app.terminals-runtimes.js", import.meta.url), "utf8");
  assert.match(source, /function refreshTerminalRuntimePickers\(\)/);
  assert.match(source, /renderTerminalModelSearchResults\(input\)/);
  assert.match(source, /if \(!refreshTerminalRuntimePickers\(\)\) render\(\)/);
});

test("terminal setup keeps CLI downloads in model-row icon controls", () => {
  const source = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /data-terminal-runtime-install=/);
  assert.doesNotMatch(source, /Start Auto with a task/);
  assert.match(source, /`Start \$\{team \? "team" : "solo"\} workspace`/);
  assert.doesNotMatch(source, /Download CLI from model list/);
});
