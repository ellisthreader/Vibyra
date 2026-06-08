import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { mkdir, realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";

const runFile = promisify(execFile);
let worktreeQueue = Promise.resolve();

export function normalizeTerminalWorkspaceMode(value) {
  return ["worktree", "isolated"].includes(String(value || "").trim().toLowerCase())
    ? "worktree"
    : "shared";
}

export function prepareTerminalWorkspace(options = {}) {
  const mode = normalizeTerminalWorkspaceMode(options.workspaceMode);
  if (mode === "shared") return prepareWorkspace(options);
  const prepared = worktreeQueue.then(() => prepareWorkspace(options));
  worktreeQueue = prepared.catch(() => {});
  return prepared;
}

export function inspectTerminalWorkspace(project) {
  return worktreeQueue.then(() => inspectWorkspaceProject(project));
}

export function createTerminalWorkspaceCheckpoint(project) {
  const checkpoint = worktreeQueue.then(() => checkpointWorkspaceProject(project));
  worktreeQueue = checkpoint.catch(() => {});
  return checkpoint;
}

async function prepareWorkspace({ project, terminalId, workspaceMode } = {}) {
  const mode = normalizeTerminalWorkspaceMode(workspaceMode);
  if (mode === "shared") {
    if (!project?.path) throw new Error("A project is required for a terminal workspace.");
    return metadata("shared", resolve(project.path));
  }
  assertWorktreeProject(project);
  const projectPath = await existingDirectory(project.path, "Project directory does not exist.");
  const repositoryRoot = await gitPath(projectPath, ["rev-parse", "--show-toplevel"],
    "Project is not inside a Git repository.");
  const status = await git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]);
  if (status.trim()) {
    throw new Error("Separate branches need a saved Git checkpoint, but this project has changes that are not saved in Git yet.");
  }

  const projectRelative = relative(repositoryRoot, projectPath);
  if (projectRelative.startsWith("..") || isAbsolute(projectRelative)) {
    throw new Error("Project is outside its Git repository.");
  }
  const root = managedRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const suffix = shortHash(`${terminalId || ""}:${randomUUID()}`);
  const slug = sanitize(project.name || projectRelative || "project");
  const branchName = `vibyra/${slug}-${suffix}`;
  const workspacePath = resolve(root, `${slug}-${suffix}`);
  assertManagedPath(workspacePath, root);

  try {
    await git(repositoryRoot, ["worktree", "add", "-b", branchName, workspacePath, "HEAD"]);
    const cwd = resolve(workspacePath, projectRelative);
    await existingDirectory(cwd, "Project subdirectory is missing from the worktree.");
    return metadata("worktree", cwd, branchName, workspacePath, repositoryRoot);
  } catch (error) {
    await rollbackPreparedTerminalWorkspace({
      workspaceMode: "worktree", branchName, workspacePath, repositoryRoot
    });
    throw error;
  }
}

async function inspectWorkspaceProject(project) {
  assertWorktreeProject(project);
  const projectPath = await existingDirectory(project.path, "Project directory does not exist.");
  const repositoryRoot = await gitPath(projectPath, ["rev-parse", "--show-toplevel"],
    "Project is not inside a Git repository.");
  try {
    await git(repositoryRoot, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    throw new Error("Separate branches need a project with at least one local Git checkpoint.");
  }
  const status = await git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]);
  const changedFiles = status.split(/\r?\n/).filter(Boolean).length;
  return {
    clean: changedFiles === 0,
    changedFiles,
    repositoryRoot
  };
}

async function checkpointWorkspaceProject(project) {
  const state = await inspectWorkspaceProject(project);
  if (state.clean) return { ...state, created: false, commit: "" };
  await git(state.repositoryRoot, ["add", "--all"]);
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  await git(state.repositoryRoot, [
    "-c", "user.name=Vibyra",
    "-c", "user.email=local-checkpoint@vibyra.invalid",
    "-c", "commit.gpgSign=false",
    "commit", "--no-verify", "-m", `Vibyra local checkpoint ${stamp}`
  ]);
  const commit = (await git(state.repositoryRoot, ["rev-parse", "--short", "HEAD"])).trim();
  return { clean: true, changedFiles: state.changedFiles, repositoryRoot: state.repositoryRoot, created: true, commit };
}

export async function restoredTerminalWorkspace(config = {}, project) {
  const mode = normalizeTerminalWorkspaceMode(config.workspaceMode);
  if (!project?.path || (mode === "worktree" && project.id === "full-pc")) return null;
  try {
    const projectPath = await existingDirectory(project.path);
    if (mode === "shared") {
      const cwd = await existingDirectory(config.cwd);
      return cwd === projectPath ? metadata("shared", cwd) : null;
    }

    const root = managedRoot();
    const workspacePath = await existingDirectory(config.workspacePath);
    assertManagedPath(workspacePath, root);
    const cwd = await existingDirectory(config.cwd);
    if (!isWithin(cwd, workspacePath)) return null;

    const expectedRepo = await gitPath(projectPath, ["rev-parse", "--show-toplevel"]);
    const savedRepo = await existingDirectory(config.repositoryRoot);
    if (savedRepo !== expectedRepo) return null;
    const actualWorktree = await gitPath(workspacePath, ["rev-parse", "--show-toplevel"]);
    if (actualWorktree !== workspacePath) return null;

    const expectedCommon = await commonGitDirectory(expectedRepo);
    const actualCommon = await commonGitDirectory(workspacePath);
    if (actualCommon !== expectedCommon) return null;
    if (!(await registeredWorktree(expectedRepo, workspacePath))) return null;

    const branchName = String(config.branchName || "");
    if (!branchName.startsWith("vibyra/")) return null;
    const actualBranch = (await git(workspacePath, ["symbolic-ref", "--short", "HEAD"])).trim();
    if (actualBranch !== branchName) return null;

    const projectRelative = relative(expectedRepo, projectPath);
    if (resolve(workspacePath, projectRelative) !== cwd) return null;
    return metadata("worktree", cwd, branchName, workspacePath, expectedRepo);
  } catch {
    return null;
  }
}

export async function rollbackPreparedTerminalWorkspace(workspace = {}) {
  if (normalizeTerminalWorkspaceMode(workspace.workspaceMode) !== "worktree") return;
  try {
    const root = managedRoot();
    const workspacePath = resolve(String(workspace.workspacePath || ""));
    const repositoryRoot = resolve(String(workspace.repositoryRoot || ""));
    const branchName = String(workspace.branchName || "");
    assertManagedPath(workspacePath, root);
    if (!branchName.startsWith("vibyra/")) return;
    await git(repositoryRoot, ["worktree", "remove", "--force", workspacePath]).catch(() => {});
    await git(repositoryRoot, ["branch", "-D", branchName]).catch(() => {});
  } catch {
    // Rollback is best effort and must not hide the original creation failure.
  }
}

function metadata(workspaceMode, cwd, branchName = "", workspacePath = "", repositoryRoot = "") {
  return { workspaceMode, cwd, branchName, workspacePath, repositoryRoot };
}

function assertWorktreeProject(project) {
  if (!project?.path) throw new Error("A project is required for Git worktree mode.");
  if (project.id === "full-pc") throw new Error("Full PC cannot use Git worktree mode.");
}

function managedRoot() {
  return resolve(process.env.VIBYRA_TERMINAL_WORKTREE_ROOT
    || join(homedir(), ".vibyra-agent", "terminal-worktrees"));
}

function assertManagedPath(path, root) {
  if (!isWithin(path, root) || path === root) throw new Error("Worktree path is outside the managed root.");
}

function isWithin(path, parent) {
  const child = relative(parent, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

async function existingDirectory(path, message = "Directory does not exist.") {
  if (!path) throw new Error(message);
  const resolved = await realpath(resolve(String(path)));
  if (!(await stat(resolved)).isDirectory()) throw new Error(message);
  return resolved;
}

async function git(cwd, args) {
  try {
    const { stdout } = await runFile("git", ["-C", cwd, ...args], {
      encoding: "utf8", maxBuffer: 4 * 1024 * 1024
    });
    return stdout;
  } catch (error) {
    const message = String(error?.stderr || error?.message || "").trim();
    throw new Error(message || "Git operation failed.", { cause: error });
  }
}

async function gitPath(cwd, args, message) {
  try {
    return await realpath(resolve(cwd, (await git(cwd, args)).trim()));
  } catch (error) {
    if (message) throw new Error(message, { cause: error });
    throw error;
  }
}

async function commonGitDirectory(cwd) {
  return gitPath(cwd, ["rev-parse", "--git-common-dir"]);
}

async function registeredWorktree(repositoryRoot, workspacePath) {
  const output = await git(repositoryRoot, ["worktree", "list", "--porcelain"]);
  return output.split(/\r?\n/).some((line) =>
    line.startsWith("worktree ") && resolve(line.slice(9)) === workspacePath);
}

function sanitize(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 40) || "project";
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}
