import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseClaudeAuthStatus,
  readCodexAuthState,
  readGeminiAuthState
} from "./providerAccountState.mjs";
import {
  firstUrl,
  geminiBrowserPromptNeedsConfirmation,
  providerAccountLoginCommand,
  writeGeminiGoogleAuthSettings
} from "./providerAccountAuth.mjs";
import { openAiVoiceCredential, providerAccountsState } from "./providerAccounts.mjs";

test("Codex personal accounts require ChatGPT tokens and reject API-key-only auth", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-codex-account-"));
  try {
    const authPath = join(root, "auth.json");
    writeFileSync(authPath, JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "redacted" }));
    assert.equal(readCodexAuthState(authPath).connected, false);

    writeFileSync(authPath, JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: "redacted", refresh_token: "redacted" },
      last_refresh: "2026-06-12T10:00:00.000Z"
    }));
    const state = readCodexAuthState(authPath);
    assert.equal(state.connected, true);
    assert.equal(state.authMode, "chatgpt");
    assert.equal(state.accountLabel, "ChatGPT");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Claude personal accounts require claude.ai subscription auth", () => {
  const subscription = parseClaudeAuthStatus(JSON.stringify({
    loggedIn: true,
    authMethod: "claude.ai",
    email: "person@example.test",
    subscriptionType: "pro"
  }));
  const consoleAuth = parseClaudeAuthStatus(JSON.stringify({
    loggedIn: true,
    authMethod: "console",
    email: "person@example.test"
  }));

  assert.equal(subscription.connected, true);
  assert.equal(subscription.accountLabel, "person@example.test");
  assert.match(subscription.detail, /Pro plan/);
  assert.equal(consoleAuth.connected, false);
});

test("Gemini personal accounts require Google OAuth selection and OAuth credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-gemini-account-"));
  try {
    const settingsPath = join(root, "settings.json");
    const credentialsPath = join(root, "oauth_creds.json");
    writeFileSync(settingsPath, JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }));
    writeFileSync(credentialsPath, JSON.stringify({ refresh_token: "redacted" }));
    assert.equal(readGeminiAuthState(settingsPath, credentialsPath).connected, false);

    writeFileSync(settingsPath, JSON.stringify({ security: { auth: { selectedType: "oauth-personal" } } }));
    const state = readGeminiAuthState(settingsPath, credentialsPath);
    assert.equal(state.connected, true);
    assert.equal(state.authMode, "google");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Gemini login settings force the external Google OAuth browser flow", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-gemini-login-settings-"));
  try {
    const settingsPath = join(root, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }));

    writeGeminiGoogleAuthSettings(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.security.auth.selectedType, "oauth-personal");
    assert.equal(settings.security.auth.useExternal, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Gemini login confirms the CLI browser launch prompt", () => {
  assert.equal(
    geminiBrowserPromptNeedsConfirmation("Opening authentication page in your browser. Do you want to continue? [Y/n]:"),
    true
  );
  assert.equal(geminiBrowserPromptNeedsConfirmation("Delete saved account? [Y/n]:"), false);
  assert.equal(geminiBrowserPromptNeedsConfirmation("Opening authentication page in your browser."), false);
});

test("Gemini provider login uses the direct CLI OAuth path", () => {
  assert.deepEqual(providerAccountLoginCommand("gemini", "/bin/gemini"), {
    command: "/bin/gemini",
    args: []
  });
});

test("provider login output exposes a browser sign-in URL", () => {
  assert.equal(
    firstUrl("Open https://accounts.google.com/o/oauth2/v2/auth?client_id=test&code=abc to continue."),
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&code=abc"
  );
  assert.equal(firstUrl("No link here"), "");
});

test("provider account state exposes only native CLI account connections", () => {
  const state = providerAccountsState();
  assert.deepEqual(Object.keys(state).sort(), ["claude", "codex", "gemini"]);
  for (const account of Object.values(state)) {
    assert.equal(typeof account.available, "boolean");
    assert.equal(typeof account.connected, "boolean");
    assert.match(account.status, /^(connected|connecting|error|sign-in-required|not-installed)$/);
    assert.equal(account.apiKey, undefined);
  }
});

test("Vibyra Voice may use deployment configuration without creating a linked AI account", () => {
  const credential = openAiVoiceCredential({
    env: {
      OPENAI_API_KEY: "sk-voice-service-key",
      OPENAI_ORG_ID: "org-voice",
      OPENAI_PROJECT: "project-voice"
    },
    configPaths: []
  });

  assert.deepEqual(credential, {
    apiKey: "sk-voice-service-key",
    organization: "org-voice",
    project: "project-voice",
    source: "env"
  });
});

test("Vibyra Voice ignores OpenRouter keys when resolving OpenAI audio credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-voice-openai-key-"));
  try {
    const envPath = join(root, ".env");
    writeFileSync(envPath, "OPENAI_API_KEY=sk-proj-real-openai-key\nOPENAI_ORG_ID=org-file\n");

    const credential = openAiVoiceCredential({
      env: { OPENAI_API_KEY: "sk-or-v1-openrouter-key" },
      configPaths: [envPath]
    });

    assert.deepEqual(credential, {
      apiKey: "sk-proj-real-openai-key",
      organization: "org-file",
      project: "",
      source: "env"
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
