import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCodexTerminalMemory, prepareAiTerminalMemoryFiles } from "./aiTerminalMemoryFiles.mjs";

test("Codex memory augments private AGENTS instructions without duplication", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-codex-memory-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# Existing instructions\n");
    applyCodexTerminalMemory(root, "Remember architecture.");
    applyCodexTerminalMemory(root, "Remember updated architecture.");
    const content = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.match(content, /# Existing instructions/);
    assert.match(content, /Remember updated architecture/);
    assert.doesNotMatch(content, /Remember architecture\./);
    assert.equal((content.match(/VIBYRA_MEMORY_START/g) || []).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Gemini memory uses a private included context directory", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-gemini-memory-"));
  try {
    const paths = prepareAiTerminalMemoryFiles(root, "Remember the project.");
    const settings = JSON.parse(readFileSync(paths.geminiSettingsPath, "utf8"));
    assert.equal(readFileSync(paths.geminiContextPath, "utf8"), "Remember the project.");
    assert.equal(settings.context.loadMemoryFromIncludeDirectories, true);
    assert.deepEqual(settings.context.includeDirectories, [join(root, "memory-context")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
