import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAiAccountCredential, openAiVoiceCredential, providerAccountsState } from "./providerAccounts.mjs";

test("OpenAI personal credentials ignore inherited and repository environment keys", () => {
  const envDir = mkdtempSync(join(tmpdir(), "vibyra-openai-env-"));
  const envPath = join(envDir, ".env");
  writeFileSync(envPath, [
    "OPENAI_API_KEY=sk-test-env-key-1234567890",
    "OPENAI_ORG_ID=org-test",
    "OPENAI_PROJECT=proj-test"
  ].join("\n"));
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-company-process-key-1234567890";
  try {
    assert.equal(openAiAccountCredential({}), null);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    rmSync(envDir, { recursive: true, force: true });
  }
});

test("OpenAI personal credentials accept only an explicitly stored account", () => {
  const credential = openAiAccountCredential({
    openai: {
      apiKey: "sk-user-key-1234567890",
      organization: "org-user",
      project: "proj-user"
    }
  });

  assert.deepEqual(credential, {
    apiKey: "sk-user-key-1234567890",
    organization: "org-user",
    project: "proj-user",
    source: "local"
  });
});

test("Vibyra Voice credentials fall back to an ignored repository env file", () => {
  const envDir = mkdtempSync(join(tmpdir(), "vibyra-openai-voice-env-"));
  const envPath = join(envDir, ".env");
  writeFileSync(envPath, [
    "OPENAI_API_KEY=sk-test-voice-env-key-1234567890",
    "OPENAI_ORG_ID=org-voice",
    "OPENAI_PROJECT=proj-voice"
  ].join("\n"));
  try {
    const credential = openAiVoiceCredential({
      store: {},
      env: {},
      configPaths: [envPath]
    });

    assert.deepEqual(credential, {
      apiKey: "sk-test-voice-env-key-1234567890",
      organization: "org-voice",
      project: "proj-voice",
      source: "env"
    });
  } finally {
    rmSync(envDir, { recursive: true, force: true });
  }
});

test("Vibyra Voice prefers an explicitly stored OpenAI account over env configuration", () => {
  const credential = openAiVoiceCredential({
    store: {
      openai: {
        apiKey: "sk-user-key-1234567890",
        organization: "org-user",
        project: "proj-user"
      }
    },
    env: { OPENAI_API_KEY: "sk-env-key-1234567890" },
    configPaths: []
  });

  assert.equal(credential.apiKey, "sk-user-key-1234567890");
  assert.equal(credential.source, "local");
});

test("provider account state detects ChatGPT-backed Codex CLI auth", () => {
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = mkdtempSync(join(tmpdir(), "vibyra-codex-auth-"));
  process.env.CODEX_HOME = codexHome;
  try {
    writeFileSync(join(codexHome, "auth.json"), JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: "redacted-test-token", refresh_token: "redacted-test-refresh" },
      last_refresh: "2026-06-07T10:00:00.000Z"
    }));

    const state = providerAccountsState();

    assert.equal(state.codex.connected, true);
    assert.equal(state.codex.source, "codex-cli");
    assert.equal(state.codex.authMode, "chatgpt");
    assert.equal(state.codex.label, "ChatGPT via Codex CLI");
    assert.equal(state.codex.updatedAt, "2026-06-07T10:00:00.000Z");
    assert.equal(state.codex.tokens, undefined);
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("provider account state exposes installed Claude and Gemini CLIs without credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-provider-clis-"));
  const previousPath = process.env.PATH;
  try {
    writeFileSync(join(root, "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(join(root, "gemini"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    process.env.PATH = root;

    const state = providerAccountsState();

    assert.equal(state.claude.available, true);
    assert.equal(state.claude.connected, true);
    assert.equal(state.claude.label, "Claude Code");
    assert.equal(state.gemini.available, true);
    assert.equal(state.gemini.connected, true);
    assert.equal(state.gemini.label, "Gemini CLI");
    assert.equal(state.claude.apiKey, undefined);
    assert.equal(state.gemini.tokens, undefined);
  } finally {
    process.env.PATH = previousPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("provider account state uses Vibyra-managed runtime paths", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-managed-provider-cli-"));
  const previousGemini = process.env.VIBYRA_GEMINI_CLI;
  try {
    const gemini = join(root, "gemini");
    writeFileSync(gemini, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    process.env.VIBYRA_GEMINI_CLI = gemini;

    const state = providerAccountsState();

    assert.equal(state.gemini.available, true);
    assert.equal(state.gemini.connected, true);
    assert.equal(state.gemini.source, "native-cli");
  } finally {
    if (previousGemini === undefined) delete process.env.VIBYRA_GEMINI_CLI;
    else process.env.VIBYRA_GEMINI_CLI = previousGemini;
    rmSync(root, { recursive: true, force: true });
  }
});
