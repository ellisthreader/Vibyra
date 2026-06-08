import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAiAccountCredential, providerAccountsState } from "./providerAccounts.mjs";

test("OpenAI credentials can come from an ignored desktop env file", () => {
  const envDir = mkdtempSync(join(tmpdir(), "vibyra-openai-env-"));
  const envPath = join(envDir, ".env");
  writeFileSync(envPath, [
    "OPENAI_API_KEY=sk-test-env-key-1234567890",
    "OPENAI_ORG_ID=org-test",
    "OPENAI_PROJECT=proj-test"
  ].join("\n"));
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const credential = openAiAccountCredential([envPath]);
    assert.equal(credential.apiKey, "sk-test-env-key-1234567890");
    assert.equal(credential.organization, "org-test");
    assert.equal(credential.project, "proj-test");
    assert.equal(credential.source, "env");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    rmSync(envDir, { recursive: true, force: true });
  }
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
