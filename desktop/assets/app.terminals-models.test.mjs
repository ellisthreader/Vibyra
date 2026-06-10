import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-models.js", import.meta.url), "utf8");
const runtimesSource = readFileSync(new URL("./app.terminals-runtimes.js", import.meta.url), "utf8");
const ptySource = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const ptyRuntimeSource = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("./app.terminals-state.js", import.meta.url), "utf8");
const layoutStyles = readFileSync(new URL("./app.terminals.layout.css", import.meta.url), "utf8");
const modelStyles = readFileSync(new URL("./app.terminals.model.2.css", import.meta.url), "utf8");
const runtimeStyles = readFileSync(new URL("./app.runtime-fixes.css", import.meta.url), "utf8");
const responsiveStyles = readFileSync(new URL("./app.terminals-responsive.css", import.meta.url), "utf8");

test("terminal setup never inherits the separate Chat model preference", () => {
  assert.match(stateSource, /localStorage\.getItem\(setupModelKey\) \|\| "auto"/);
  assert.doesNotMatch(stateSource, /setupModel\s*=.*vibyra\.desktop\.chatModel/);
});

test("terminal picker keeps official CLI providers separate from OpenRouter wrappers", () => {
  const context = {
    config: () => ({
      chatModelGroups: [{
        title: "OpenAI models",
        options: [{ key: "gpt-5.5", label: "GPT-5.5", provider: "openai" }]
      }]
    }),
    window: { addEventListener() {} }
  };
  vm.runInNewContext(source, context);

  const officialWrapper = {
    key: "openai/gpt-5.5-pro",
    label: "GPT-5.5 Pro",
    provider: "openai"
  };
  const otherWrapper = {
    key: "qwen/qwen3-coder",
    label: "Qwen3 Coder",
    provider: "qwen"
  };

  assert.equal(context.terminalOpenRouterModelAllowed(officialWrapper), false);
  assert.equal(context.terminalOpenRouterModelAllowed(otherWrapper), true);
  assert.equal(context.terminalOfficialFallbackModelKey("openai/gpt-5.5-pro"), "gpt-5.5");
});

test("terminal launch agent follows token source instead of model branding alone", () => {
  assert.match(ptySource, /if \(tokenMode !== "provider"\) return "vibyra"/);
  assert.match(ptySource, /terminalOwnAccountRoute\(model\)\.agent \|\| "vibyra"/);
  assert.match(ptySource, /agent === "codex"\) return terminalProfiles\.openai/);
  assert.doesNotMatch(ptySource, /return \["openai", "claude", "gemini"\]\.includes\(provider\) \? "official"/);
  assert.match(ptySource, /terminalAgents\.some\(\(agent\) => agent\.key === reportedAgent\)\) return reportedAgent/);
});

test("CLI downloads live in model rows instead of Advanced settings", () => {
  assert.match(source, /terminalModelCliControl\(model, tokenMode\)/);
  assert.match(source, /terminal-model-option-row/);
  assert.match(source, /aria-disabled=/);
  assert.match(ptySource, /terminalRuntimeLaunchIssueForRequest/);
  assert.doesNotMatch(ptySource, /terminalRuntimePanel/);
  assert.doesNotMatch(ptySource, /Download terminal tool/);
});

test("My AI accounts exposes native mappings and rejects API-only models", () => {
  const context = {
    config: () => ({ chatModelGroups: [] }),
    providerAccounts: {
      codex: { available: true, connected: true, label: "ChatGPT via Codex CLI" },
      claude: { available: true, connected: true, label: "Claude Code" },
      gemini: { available: true, connected: true, label: "Gemini CLI" },
      openai: { connected: false }
    },
    terminalProviderKeyForModel(model) {
      const key = String(model?.key || "");
      if (key.startsWith("gpt-") || key.startsWith("openai/")) return "openai";
      if (key.startsWith("claude-")) return "claude";
      if (key.startsWith("gemini-")) return "gemini";
      if (key.startsWith("anthropic/")) return "claude";
      if (key.startsWith("deepseek/")) return "deepseek";
      return "auto";
    },
    window: { addEventListener() {} }
  };
  vm.runInNewContext(source, context);

  const codex = context.terminalOwnAccountRoute({ key: "gpt-5.5" });
  const claude = context.terminalOwnAccountRoute({ key: "claude-sonnet-4" });
  const gemini = context.terminalOwnAccountRoute({ key: "google/gemini-3.1-pro", provider: "gemini" });
  const apiOnly = context.terminalOwnAccountRoute({ key: "deepseek/deepseek-v3", provider: "deepseek" });

  assert.equal(codex.available, true);
  assert.equal(codex.agent, "codex");
  assert.equal(claude.available, true);
  assert.equal(claude.agent, "claude");
  assert.equal(gemini.available, true);
  assert.equal(gemini.agent, "gemini");
  assert.equal(apiOnly.available, false);
  assert.match(apiOnly.reason, /only available with Vibyra tokens/);
});

test("personal-account filtering keeps API-only rows visible and searchable", () => {
  const context = {
    config: () => ({
      chatModelGroups: [{
        title: "DeepSeek",
        options: [{ key: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "deepseek" }]
      }]
    }),
    providerAccounts: {},
    setupTokenMode: "provider",
    window: { addEventListener() {} }
  };
  vm.runInNewContext(source, context);

  const groups = context.filteredTerminalModelGroups("deepseek");

  assert.equal(groups.length, 1);
  assert.equal(groups[0].options[0].key, "deepseek/deepseek-v3");
});

test("model rows show Native CLI, Vibyra Agent, and unavailable states without replacing provider logos", () => {
  const context = {
    config: () => ({ chatModelGroups: [] }),
    currentPage: "",
    document: {},
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    fetch: async () => ({ ok: true, json: async () => ({ runtimes: [] }) }),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    providerAccounts: {
      codex: { available: true, connected: true }
    },
    providerLogo: (provider) => `<span class="provider-logo ${provider}"></span>`,
    render() {},
    setTimeout() {},
    setupTokenMode: "vibyra",
    window: { addEventListener() {} }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  vm.runInContext(runtimesSource, context);
  vm.runInContext(`
    terminalRuntimeState = {
      runtimes: [{ id: "codex", label: "Codex CLI", available: true, adapterReady: true, bundled: true }]
    };
  `, context);

  const nativeRow = vm.runInContext(
    'terminalModelButton({ key: "gpt-5.5", label: "GPT-5.5", provider: "openai" }, "", "data-model")',
    context
  );
  const agentRow = vm.runInContext(
    'terminalModelButton({ key: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "deepseek" }, "", "data-model")',
    context
  );
  vm.runInContext('setupTokenMode = "provider"', context);
  const unavailableRow = vm.runInContext(
    'terminalModelButton({ key: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "deepseek" }, "", "data-model")',
    context
  );

  assert.match(nativeRow, /provider-logo openai/);
  assert.match(nativeRow, />Native CLI</);
  assert.match(agentRow, /provider-logo deepseek/);
  assert.match(agentRow, />Vibyra Agent</);
  assert.match(unavailableRow, /disabled/);
  assert.match(unavailableRow, />Unavailable</);
  assert.match(modelStyles, /\.terminal-model-runtime-status\s*\{[\s\S]*font-family: ui-monospace/);
  assert.doesNotMatch(modelStyles, /\.terminal-model-runtime-status\s*\{[^}]*background:/);
});

test("token source choices explain billing without provider implementation details", () => {
  const context = {
    config: () => ({ chatModelGroups: [] }),
    providerAccounts: {
      codex: { available: true, connected: true, label: "ChatGPT via Codex CLI" }
    },
    providerConnectNotice: "",
    terminalProviderKeyForModel: () => "openai",
    escapeHtml: (value) => String(value),
    escapeAttribute: (value) => String(value),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    window: { addEventListener() {} }
  };
  vm.runInNewContext(source, context);

  const panel = context.terminalTokenSourcePanel({ key: "gpt-5.5" }, "vibyra", "setup");

  assert.match(panel, /Vibyra tokens/);
  assert.match(panel, /Uses your Vibyra credits/);
  assert.match(panel, /My AI accounts/);
  assert.match(panel, /Uses your account and its billing/);
  assert.doesNotMatch(panel, /CLI|installed|sign-in|ChatGPT|Claude Code|Gemini/);
  assert.doesNotMatch(panel, /terminal-provider-row/);
});

test("Vibyra token selection never silently changes to a personal CLI account", () => {
  const context = {
    config: () => ({ chatModelGroups: [] }),
    providerAccounts: {
      codex: { available: true, connected: true },
      claude: { available: true, connected: true, label: "Claude Code" },
      gemini: { available: true, connected: true, label: "Gemini CLI" }
    },
    terminalProviderKeyForModel(model) {
      const key = String(model?.key || "");
      if (key.startsWith("claude-")) return "claude";
      if (key.startsWith("gemini-")) return "gemini";
      if (key.startsWith("anthropic/")) return "claude";
      return "openai";
    },
    terminalRuntimeLaunchState(model, mode) {
      const key = String(model?.key || "");
      const provider = key.startsWith("claude-") || key.startsWith("anthropic/")
        ? "claude"
        : key.startsWith("gemini-") ? "gemini" : "openai";
      if (mode === "vibyra" && ["claude", "gemini"].includes(provider)) {
        return { available: false, reason: "adapter", issue: "Managed credits unavailable" };
      }
      return { available: true, reason: "", issue: "" };
    },
    window: { addEventListener() {} }
  };
  vm.runInNewContext(source, context);

  assert.equal(context.terminalTokenModeForModel({ key: "claude-sonnet-4" }, "vibyra"), "vibyra");
  assert.equal(context.terminalTokenModeForModel({ key: "gemini-2.5-pro" }, "vibyra"), "vibyra");
  assert.equal(context.terminalTokenModeForModel({ key: "anthropic/claude-sonnet-4" }, "vibyra"), "vibyra");
});

test("terminal topbar uses friendly names and keeps bulk actions in the options menu", () => {
  assert.match(ptySource, /function terminalTabAgentLabel\(terminal, index\)/);
  assert.match(ptySource, /return terminal\.title \|\| `Agent \$\{index \+ 1\}`/);
  assert.match(ptySource, /terminalAgentDisplayName\(terminal\)/);
  assert.match(ptySource, /terminalWindowActions\(terminal\)/);
  assert.match(ptySource, /id="open-terminal-toolbar"/);
  assert.match(ptySource, /data-terminal-close-all/);
  assert.match(ptySource, /Close all terminals/);
  assert.match(ptySource, /requestCloseAllPtyTerminals/);
  assert.match(ptySource, /\/desktop\/pty-terminals\/close-all/);
  assert.match(ptyRuntimeSource, /getElementById\("open-terminal-toolbar"\)/);
  assert.match(ptyRuntimeSource, /\[data-terminal-close-all\]/);
  assert.match(stateSource, /let terminalToolbarMenuOpen = false/);
  assert.match(layoutStyles, /\.terminal-tabs\s*\{[\s\S]*margin-inline: auto;[\s\S]*width: max-content/);
  assert.match(layoutStyles, /\.terminal-tab-list\s*\{[\s\S]*flex: 0 1 auto;[\s\S]*justify-content: safe center;[\s\S]*max-width: min\(640px, 62vw\)/);
  assert.match(layoutStyles, /\.terminal-tab\s*\{[\s\S]*max-width: 180px;[\s\S]*min-width: 118px/);
  assert.match(layoutStyles, /\.terminal-toolbar-menu\s*\{[\s\S]*right: 0;[\s\S]*top: calc\(100% \+ 8px\)/);
});

test("PTY terminals stay edge-to-edge and keep native bottom rows correctly sized", () => {
  assert.match(runtimeStyles, /\.terminal-pty-lines\s*\{[\s\S]*padding:\s*0\s*!important/);
  assert.match(runtimeStyles, /\.terminal-xterm\s*\{[\s\S]*height:\s*100%;[\s\S]*padding:\s*0;/);
  assert.match(runtimeStyles, /\.terminal-xterm \.xterm-viewport\s*\{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(runtimeStyles, /\.terminal-xterm \.xterm-screen,\s*\n\.terminal-xterm \.xterm-viewport/);
  assert.match(runtimeStyles, /\.grid-mode \.terminal-stage\s*\{[\s\S]*gap:\s*0;/);
  assert.match(runtimeStyles, /\.grid-mode \.terminal-tile\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*contain:\s*layout paint;[\s\S]*overflow:\s*hidden;/);
  assert.match(responsiveStyles, /\.grid-mode \.terminal-stage\s*\{[\s\S]*gap:\s*0;[\s\S]*grid-template-rows:[\s\S]*minmax\(0,\s*1fr\)[\s\S]*overflow-y:\s*hidden;/);
  assert.match(ptyRuntimeSource, /dimensions\?\.css\?\.cell/);
  assert.match(ptyRuntimeSource, /Math\.round\(availableHeight \/ cellHeight\)/);
  assert.match(ptyRuntimeSource, /queueMicrotask\(launch\)/);
  assert.match(ptyRuntimeSource, /mountVisibleXterms\(\);[\s\S]*startPtyTerminal\(terminal\)/);
  assert.match(ptyRuntimeSource, /schedulePtyXtermFit\(terminal\.id, \{ forceBackend: true \}\)/);
  assert.match(ptyRuntimeSource, /backendMatches = Number\(terminal\?\.cols\) === backendSize\.cols/);
  assert.match(ptyRuntimeSource, /terminalPtyBottomOverscanRows/);
  assert.match(ptyRuntimeSource, /terminalPtyBottomInsetPixels/);
  assert.match(ptyRuntimeSource, /fractionalOverflow = \(rows \* cellHeight\) - availableHeight/);
  assert.match(ptyRuntimeSource, /const totalHeight = extraHeight \+ inset/);
  assert.match(ptyRuntimeSource, /xterm\.rows === backendSize\.rows/);
  assert.match(ptyRuntimeSource, /applyPtyBottomOverscan\(terminal,\s*xterm\)/);
  assert.match(ptyRuntimeSource, /scrollToBottom\?\.\(\)/);
  assert.match(runtimeStyles, /\.terminal-pty-lines:focus-within\s*\{/);
});
