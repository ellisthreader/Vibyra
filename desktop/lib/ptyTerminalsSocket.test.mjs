import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("PTY socket input errors are contained inside the socket handler", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-socket-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?socket=${Date.now()}`, import.meta.url);
    const { handlePtySocketMessage } = await import(moduleUrl);
    assert.doesNotThrow(() => {
      handlePtySocketMessage("missing-terminal", JSON.stringify({ type: "input", data: "\u001b[0n" }));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});
