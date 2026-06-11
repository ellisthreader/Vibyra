import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  formatTranscriptHistory,
  listWorkspaceEntries,
  readWorkspaceGitStatus,
  removeStagedContext,
  resolveWorkspacePath
} from "./aiTerminalVibyraAgentWorkspace.mjs";

test("workspace listing is bounded, sorted, and skips generated directories", () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-agent-workspace-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "package.json"), "{}");

  assert.equal(listWorkspaceEntries(root), "dir   src/\nfile  package.json");
});

test("transcript history is compact and count bounded", () => {
  const transcript = [
    { role: "user", text: "Inspect\nthis workspace" },
    { role: "assistant", text: "Done" }
  ];

  assert.equal(formatTranscriptHistory(transcript, 1), "2. ASSISTANT  Done");
  assert.match(formatTranscriptHistory(transcript, 20), /1\. USER  Inspect this workspace/);
});

test("staged context removal supports a path, basename, and all", () => {
  const contexts = [resolve("/tmp/alpha.txt"), resolve("/tmp/beta.txt")];

  assert.deepEqual(removeStagedContext(contexts, "alpha.txt"), {
    removed: 1,
    remaining: 1,
    path: resolve("/tmp/alpha.txt")
  });
  assert.deepEqual(removeStagedContext(contexts, "all"), {
    removed: 1,
    remaining: 0,
    path: ""
  });
});

test("Git status is read-only and strips the terminal gateway credential", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-agent-git-"));
  const status = await readWorkspaceGitStatus(root, {
    ...process.env,
    VIBYRA_TERMINAL_GATEWAY_TOKEN: "must-not-leak"
  });

  assert.equal(status, "This workspace is not a Git repository.");
});

test("Standard paths stay inside the launch workspace while Full access may leave it", () => {
  const root = resolve("/tmp/vibyra-agent-root");

  assert.equal(resolveWorkspacePath("src", { cwd: root, workspaceRoot: root }), resolve(root, "src"));
  assert.throws(
    () => resolveWorkspacePath("/etc", { cwd: root, workspaceRoot: root }),
    /Standard access is limited/
  );
  assert.equal(
    resolveWorkspacePath("/etc", { cwd: root, workspaceRoot: root, permissionMode: "full" }),
    resolve("/etc")
  );
});
