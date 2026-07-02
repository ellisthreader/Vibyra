import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import test from "node:test";
import {
  createTerminalWorkspaceCheckpoint,
  inspectTerminalWorkspace,
  normalizeTerminalWorkspaceMode,
  prepareTerminalWorkspace,
  restoredTerminalWorkspace,
  rollbackPreparedTerminalWorkspace
} from "./terminalWorktrees.mjs";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-worktree-repo-"));
  git(root, "init");
  git(root, "config", "user.email", "tests@vibyra.local");
  git(root, "config", "user.name", "Vibyra Tests");
  writeFileSync(join(root, "README.md"), "clean\n");
  mkdirSync(join(root, "apps", "desktop"), { recursive: true });
  writeFileSync(join(root, "apps", "desktop", "package.json"), "{}\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  return root;
}

function project(path, name = "Desktop App") {
  return { id: Buffer.from(path).toString("base64url"), name, path };
}

async function withRepo(run) {
  const repo = repository();
  const managed = mkdtempSync(join(tmpdir(), "vibyra-terminal-worktrees-"));
  process.env.VIBYRA_TERMINAL_WORKTREE_ROOT = managed;
  try {
    await run(repo, managed);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(managed, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_WORKTREE_ROOT;
  }
}

test("normalizes isolated modes and prepares shared project metadata", async () => {
  await withRepo(async (repo) => {
    assert.equal(normalizeTerminalWorkspaceMode("isolated"), "worktree");
    assert.equal(normalizeTerminalWorkspaceMode("WORKTREE"), "worktree");
    assert.equal(normalizeTerminalWorkspaceMode("anything"), "shared");
    const workspace = await prepareTerminalWorkspace({
      project: project(repo), terminalId: "shared-1", workspaceMode: "shared"
    });
    assert.deepEqual(workspace, {
      workspaceMode: "shared",
      cwd: repo,
      branchName: "",
      workspacePath: "",
      repositoryRoot: ""
    });
    assert.deepEqual(await restoredTerminalWorkspace(workspace, project(repo)), workspace);
    assert.equal(await restoredTerminalWorkspace({ ...workspace, cwd: join(repo, "apps") },
      project(repo)), null);
  });
});

test("creates and restores a clean Git worktree", async () => {
  await withRepo(async (repo, managed) => {
    const workspace = await prepareTerminalWorkspace({
      project: project(repo), terminalId: "terminal-1", workspaceMode: "worktree"
    });
    assert.equal(workspace.workspaceMode, "worktree");
    assert.match(workspace.branchName, /^vibyra\/desktop-app-[a-f0-9]{10}$/);
    assert.equal(workspace.repositoryRoot, repo);
    assert.ok(workspace.workspacePath.startsWith(`${managed}${sep}`));
    assert.equal(git(workspace.workspacePath, "branch", "--show-current"), workspace.branchName);
    assert.deepEqual(await restoredTerminalWorkspace(workspace, project(repo)), workspace);
    await rollbackPreparedTerminalWorkspace(workspace);
    assert.equal(git(repo, "branch", "--list", workspace.branchName), "");
  });
});

test("rejects tracked and untracked repository changes", async () => {
  await withRepo(async (repo) => {
    writeFileSync(join(repo, "README.md"), "changed\n");
    await assert.rejects(prepareTerminalWorkspace({
      project: project(repo), terminalId: "dirty-1", workspaceMode: "worktree"
    }), /saved Git checkpoint/);
    git(repo, "restore", "README.md");
    writeFileSync(join(repo, "untracked.secret"), "do not copy\n");
    await assert.rejects(prepareTerminalWorkspace({
      project: project(repo), terminalId: "dirty-2", workspaceMode: "worktree"
    }), /saved Git checkpoint/);
  });
});

test("inspects and creates a local checkpoint without remote Git", async () => {
  await withRepo(async (repo) => {
    writeFileSync(join(repo, "README.md"), "checkpointed\n");
    writeFileSync(join(repo, "local-note.md"), "local only\n");
    const hook = join(repo, ".git", "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o700);
    const before = await inspectTerminalWorkspace(project(repo));
    assert.equal(before.clean, false);
    assert.equal(before.changedFiles, 2);
    const checkpoint = await createTerminalWorkspaceCheckpoint(project(repo));
    assert.equal(checkpoint.clean, true);
    assert.equal(checkpoint.created, true);
    assert.match(checkpoint.commit, /^[a-f0-9]+$/);
    assert.equal(git(repo, "status", "--porcelain"), "");
    assert.equal(git(repo, "show", "-s", "--format=%an <%ae>"),
      "Vibyra <local-checkpoint@vibyra.invalid>");
    assert.match(git(repo, "log", "-1", "--pretty=%s"), /^Vibyra local checkpoint /);
    assert.equal(git(repo, "remote"), "");
  });
});

test("preserves a project cwd nested below the repository root", async () => {
  await withRepo(async (repo) => {
    const nested = join(repo, "apps", "desktop");
    const workspace = await prepareTerminalWorkspace({
      project: project(nested, "Nested Desktop"),
      terminalId: "nested-1",
      workspaceMode: "isolated"
    });
    assert.equal(workspace.cwd, join(workspace.workspacePath, "apps", "desktop"));
    assert.deepEqual(await restoredTerminalWorkspace(workspace, project(nested)), workspace);
    await rollbackPreparedTerminalWorkspace(workspace);
  });
});

test("rejects tampered persisted worktree metadata", async () => {
  await withRepo(async (repo, managed) => {
    const workspace = await prepareTerminalWorkspace({
      project: project(repo), terminalId: "tamper-1", workspaceMode: "worktree"
    });
    assert.equal(await restoredTerminalWorkspace({
      ...workspace, branchName: "vibyra/wrong-branch"
    }, project(repo)), null);
    assert.equal(await restoredTerminalWorkspace({
      ...workspace, cwd: managed
    }, project(repo)), null);
    assert.equal(await restoredTerminalWorkspace({
      ...workspace, workspacePath: repo
    }, project(repo)), null);
    await rollbackPreparedTerminalWorkspace(workspace);
  });
});
