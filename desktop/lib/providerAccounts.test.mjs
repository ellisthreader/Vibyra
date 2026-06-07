import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerAccountsState } from "./providerAccounts.mjs";

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
