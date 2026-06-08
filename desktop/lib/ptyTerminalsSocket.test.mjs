import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

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

test("OpenRouter model slugs do not launch unsupported official CLIs", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-routing-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?routing=${Date.now()}`, import.meta.url);
    const { terminalAgentForModel } = await import(moduleUrl);

    assert.equal(terminalAgentForModel("gpt-5.5"), "codex");
    assert.equal(terminalAgentForModel("openai/gpt-5.5-pro"), "");
    assert.equal(terminalAgentForModel("anthropic/claude-sonnet-4.5"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("official terminal Memory stays out of public PTY session payloads", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-memory-private-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const previousPath = process.env.PATH;
  const previousFetch = global.fetch;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const previousToken = appState.desktopAccountToken;
  appState.cachedProjects = [{ id: "project-memory", name: "Memory", path: root }];
  appState.desktopAccountToken = "account-token";
  process.env.PATH = "";
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        vault: {
          nodes: [{ id: "note", type: "document", name: "Context.md", markdown: "Private terminal context" }]
        }
      };
    }
  });
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?memoryPrivate=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    const session = await createPtyTerminal({
      id: "private-memory-terminal",
      agent: "claude",
      projectId: "project-memory"
    });
    assert.equal("memoryInstructions" in session, false);
    closeAllPtyTerminals();
  } finally {
    appState.cachedProjects = previousProjects;
    appState.desktopAccountToken = previousToken;
    process.env.PATH = previousPath;
    global.fetch = previousFetch;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("close all removes every PTY session regardless of status", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-close-all-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?closeAll=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal, listPtyTerminals } = await import(moduleUrl);
    await createPtyTerminal({ id: "missing-agent-1", agent: "gemini", title: "One" });
    await createPtyTerminal({ id: "missing-agent-2", agent: "gemini", title: "Two" });

    assert.equal(listPtyTerminals().length, 2);
    assert.equal(closeAllPtyTerminals(), 2);
    assert.deepEqual(listPtyTerminals(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("PTY terminal names can be changed without relaunching", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-rename-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?rename=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal, listPtyTerminals, renamePtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({ id: "rename-terminal", agent: "gemini", title: "Original" });

    const renamed = renamePtyTerminal("rename-terminal", { title: "  Build checks  " });

    assert.equal(renamed.title, "Build checks");
    assert.equal(listPtyTerminals()[0].title, "Build checks");
    closeAllPtyTerminals();
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("reusing a running terminal ID cannot switch its project", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-project-conflict-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [
    { id: "project-a", name: "A", path: "/tmp/project-a" },
    { id: "project-b", name: "B", path: "/tmp/project-b" }
  ];
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?projectConflict=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({ id: "same-id", agent: "gemini", projectId: "project-a" });

    await assert.rejects(
      () => createPtyTerminal({ id: "same-id", agent: "gemini", projectId: "project-b" }),
      /already running in a different project/
    );
    closeAllPtyTerminals();
  } finally {
    appState.cachedProjects = previousProjects;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("reusing a running terminal ID cannot switch its model or launch settings", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-settings-conflict-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?settingsConflict=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({
      id: "same-settings-id",
      agent: "gemini",
      model: "gemini-2.5-pro",
      reasoningEffort: "medium",
      permissionMode: "standard",
      tokenMode: "vibyra"
    });

    await assert.rejects(
      () => createPtyTerminal({
        id: "same-settings-id",
        agent: "gemini",
        model: "gemini-3-pro",
        reasoningEffort: "medium",
        permissionMode: "standard",
        tokenMode: "vibyra"
      }),
      /already running with different launch settings/
    );
    closeAllPtyTerminals();
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("restored terminal cwd must match the server-resolved project", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-restore-location-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [{
    id: "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT",
    name: "SaaS",
    path: "/home/ellis/Desktop/SaaS"
  }];
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?restoreLocation=${Date.now()}`, import.meta.url);
    const { restoredTerminalLocation } = await import(moduleUrl);
    const config = {
      projectId: "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT",
      cwd: "/home/ellis/Desktop/SaaS"
    };

    assert.deepEqual(await restoredTerminalLocation(config), {
      ...config,
      workspaceMode: "shared",
      branchName: "",
      workspacePath: "",
      repositoryRoot: "",
      workspaceNotice: ""
    });
    assert.equal(await restoredTerminalLocation({ ...config, cwd: "/home/ellis/.ssh" }), null);
    assert.equal(await restoredTerminalLocation({ projectId: "manufactured-id", cwd: "/home/ellis/.ssh" }), null);
  } finally {
    appState.cachedProjects = previousProjects;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("isolated PTY sessions use and preserve an authoritative Git worktree", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-worktree-"));
  const repo = join(root, "repo");
  const sessions = join(root, "sessions");
  const worktrees = join(root, "worktrees");
  mkdirSync(repo, { recursive: true });
  git(repo, "init");
  git(repo, "config", "user.email", "tests@vibyra.local");
  git(repo, "config", "user.name", "Vibyra Tests");
  writeFileSync(join(repo, "README.md"), "clean\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "initial");
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = sessions;
  process.env.VIBYRA_TERMINAL_WORKTREE_ROOT = worktrees;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const project = { id: Buffer.from(repo).toString("base64url"), name: "Repo", path: repo };
  appState.cachedProjects = [project];
  let workspace = null;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?worktree=${Date.now()}`, import.meta.url);
    const { closePtyTerminal, createPtyTerminal } = await import(moduleUrl);
    workspace = await createPtyTerminal({
      id: "isolated-terminal",
      agent: "gemini",
      projectId: project.id,
      workspaceMode: "worktree"
    });
    assert.equal(workspace.workspaceMode, "worktree");
    assert.match(workspace.branchName, /^vibyra\//);
    assert.equal(git(workspace.workspacePath, "branch", "--show-current"), workspace.branchName);
    closePtyTerminal(workspace.id);
    assert.equal(existsSync(workspace.workspacePath), true);
  } finally {
    if (workspace) {
      const { rollbackPreparedTerminalWorkspace } = await import("./terminalWorktrees.mjs");
      await rollbackPreparedTerminalWorkspace(workspace);
    }
    appState.cachedProjects = previousProjects;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_TERMINAL_WORKTREE_ROOT;
  }
});

test("dirty isolated PTY requests can safely fall back to the shared project", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-worktree-fallback-"));
  const sessions = join(root, "sessions");
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = sessions;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const project = { id: Buffer.from(root).toString("base64url"), name: "Dirty", path: root };
  git(root, "init");
  git(root, "config", "user.email", "tests@vibyra.local");
  git(root, "config", "user.name", "Vibyra Tests");
  writeFileSync(join(root, "README.md"), "clean\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  writeFileSync(join(root, "README.md"), "dirty\n");
  appState.cachedProjects = [project];
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?fallback=${Date.now()}`, import.meta.url);
    const { closePtyTerminal, createPtyTerminal } = await import(moduleUrl);
    const session = await createPtyTerminal({
      id: "fallback-terminal",
      agent: "gemini",
      projectId: project.id,
      workspaceMode: "worktree",
      allowSharedFallback: true
    });
    assert.equal(session.workspaceMode, "shared");
    assert.equal(session.cwd, root);
    assert.match(session.workspaceNotice, /opened in the shared folder/);
    closePtyTerminal(session.id);
  } finally {
    appState.cachedProjects = previousProjects;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});
