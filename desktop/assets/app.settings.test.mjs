import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const state = readFileSync(new URL("./app.profile-state.js", import.meta.url), "utf8");
const sections = readFileSync(new URL("./app.settings-sections.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("./app.settings-actions.js", import.meta.url), "utf8");
const aiAccounts = readFileSync(new URL("./app.profile-ai-accounts.js", import.meta.url), "utf8");
const profileActions = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");
const layout = readFileSync(new URL("./app.profile.css", import.meta.url), "utf8");
const markup = readFileSync(new URL("../app.html", import.meta.url), "utf8");

test("settings uses seven clear sections without a label-only search", () => {
  for (const key of ["profile", "personalization", "ai-accounts", "app", "devices", "billing", "help"]) {
    assert.match(state, new RegExp(`key: "${key}"`));
  }
  assert.doesNotMatch(sections, /profile-section-search|profile-section-empty/);
  assert.doesNotMatch(state, /Improve Vibyra|Desktop app lock|profileLanguages|profileFaqs/);
});

test("AI accounts use native provider login and never render API credential fields", () => {
  assert.match(aiAccounts, /Vibyra never asks for or stores API keys/);
  assert.match(aiAccounts, /provider-accounts\/\$\{encodeURIComponent\(provider\)\}\/\$\{action\}/);
  assert.match(aiAccounts, /terminal-runtimes\/\$\{encodeURIComponent\(provider\)\}\/install/);
  assert.match(aiAccounts, /profileAiAccountModels/);
  assert.match(aiAccounts, /profileAiAccountRuntimeForModel/);
  assert.match(profileActions, /ai-account-open-url/);
  assert.doesNotMatch(aiAccounts, /apiKey|type="password"|Organization|Project/);
  assert.match(markup, /app\.profile-ai-accounts\.css/);
  assert.match(markup, /app\.profile-ai-accounts\.js/);
});

test("AI account rows do not show Disconnect unless normalized status is connected", () => {
  const context = {
    document: { activeElement: null },
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    providerLogo: (provider) => `<span>${provider}</span>`,
    settingsHeader: (title, detail) => `<h2>${title}</h2><p>${detail}</p>`
  };
  vm.runInNewContext(aiAccounts, context);

  const staleRow = context.profileAiAccountAction(
    { key: "codex" },
    { available: true, connected: true, status: "sign-in-required" },
    false
  );
  const connectedRow = context.profileAiAccountAction(
    { key: "codex" },
    { available: true, connected: true, status: "connected" },
    false
  );
  const connectingRow = context.profileAiAccountAction(
    { key: "gemini" },
    {
      available: true,
      connected: false,
      loginUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      status: "connecting"
    },
    false
  );
  const normalized = context.normalizeProfileAiAccounts({
    codex: { available: true, connected: true, label: "ChatGPT via Codex CLI" }
  });

  assert.match(staleRow, />Sign in</);
  assert.doesNotMatch(staleRow, />Disconnect</);
  assert.match(connectedRow, />Disconnect</);
  assert.match(connectingRow, /Open sign-in page/);
  assert.match(connectingRow, /data-profile-action="ai-account-open-url"/);
  assert.equal(normalized.codex.status, "connected");
  assert.equal(normalized.codex.accountLabel, "ChatGPT via Codex CLI");
});

test("AI account rows show only login-capable model families", () => {
  const context = {
    config: () => ({
      chatModelGroups: [{
        options: [
          { key: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
          { key: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "claude" },
          { key: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "deepseek" }
        ]
      }]
    }),
    document: { activeElement: null },
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    providerLogo: (provider) => `<span>${provider}</span>`,
    settingsHeader: (title, detail) => `<h2>${title}</h2><p>${detail}</p>`,
    terminalNativeRuntimeForModel(model) {
      if (model.provider === "openai") return "codex";
      if (model.provider === "claude") return "claude";
      return "";
    }
  };
  vm.runInNewContext(aiAccounts, context);

  const codexModels = context.profileAiAccountModels({ key: "codex" });
  const claudeModels = context.profileAiAccountModels({ key: "claude" });
  const row = context.settingsAiAccountsSection();

  assert.deepEqual(codexModels.map((model) => model.key), ["gpt-5.5"]);
  assert.deepEqual(claudeModels.map((model) => model.key), ["claude-sonnet-4-6"]);
  assert.match(row, /GPT-5\.5/);
  assert.match(row, /Claude Sonnet 4\.6/);
  assert.doesNotMatch(row, /DeepSeek V3/);
});

test("cloud profile and local personalization save independently", () => {
  assert.match(profileActions, /async function saveDesktopProfile/);
  assert.doesNotMatch(profileActions, /saveProfilePreferencesFromForm/);
  assert.match(actions, /function saveDesktopPersonalization/);
  assert.match(actions, /saveDesktopPreferences\(prefs\)/);
});

test("App settings persist the shared Vibyra language catalog", () => {
  for (const language of ["English", "Español", "Français", "Deutsch", "Português", "日本語", "中文"]) {
    assert.match(state, new RegExp(language));
  }
  assert.match(sections, /profileSelectRow\("App language", "language", profileLanguageOptions, prefs\.language\)/);
  assert.match(profileActions, /key === "language"/);
  assert.match(state, /document\.documentElement\.lang = language\.locale/);
  assert.match(state, /language: profileLanguageOptions\.find/);
});

test("destructive settings actions use inline confirmation instead of native confirm", () => {
  assert.match(actions, /renderSettingsConfirmation/);
  assert.match(sections, /data-profile-action="logout-all"/);
  assert.doesNotMatch(`${actions}\n${profileActions}`, /window\.confirm/);
});

test("narrow settings uses a horizontal sticky section strip", () => {
  assert.match(layout, /@media \(max-width: 720px\)/);
  assert.match(layout, /\.profile-modal-body \.profile-section-rail[\s\S]*position: sticky/);
  assert.match(layout, /\.profile-modal-body \.profile-section-list[\s\S]*overflow-x: auto/);
});

test("settings modules load in dependency order with semantic stylesheet names", () => {
  const stateIndex = markup.indexOf("app.profile-state.js");
  const actionIndex = markup.indexOf("app.settings-actions.js");
  const sectionIndex = markup.indexOf("app.settings-sections.js");
  const renderIndex = markup.indexOf("app.profile-render.js");
  assert.ok(stateIndex < actionIndex && actionIndex < sectionIndex && sectionIndex < renderIndex);
  assert.match(markup, /app\.settings-layout\.css/);
  assert.match(markup, /app\.settings-content\.css/);
  assert.match(markup, /app\.settings-fields\.css/);
  assert.doesNotMatch(markup, /app\.profile\.[123]\.css/);
});
