import { spawn } from "node:child_process";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const HIDDEN_DIRECTORIES = new Set([
  ".git",
  ".expo",
  ".vibyra-agent",
  "backend/vendor",
  "node_modules"
]);

export function listWorkspaceEntries(path, { limit = 60 } = {}) {
  const directory = resolve(String(path || process.cwd()));
  if (!statSync(directory).isDirectory()) {
    throw new Error(`Not a directory: ${path}`);
  }
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !hiddenEntry(directory, entry.name))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  const visible = entries.slice(0, Math.max(1, limit));
  const lines = visible.map((entry) => `${entry.isDirectory() ? "dir " : "file"}  ${entry.name}${entry.isDirectory() ? "/" : ""}`);
  if (entries.length > visible.length) lines.push(`... ${entries.length - visible.length} more`);
  return lines.length ? lines.join("\n") : "Directory is empty.";
}

export async function readWorkspaceGitStatus(cwd = process.cwd(), environment = process.env) {
  const result = await runReadOnlyCommand(
    "git",
    ["status", "--short", "--branch", "--untracked-files=normal"],
    cwd,
    environment
  );
  if (result.code === 0) return result.output || "Working tree clean.";
  if (/not a git repository/i.test(result.output)) return "This workspace is not a Git repository.";
  throw new Error(result.output || "Git status failed.");
}

export function formatTranscriptHistory(transcript = [], requestedCount = 12) {
  const count = clampCount(requestedCount);
  const items = transcript.slice(-count);
  if (!items.length) return "No terminal history yet.";
  return items.map((item, index) => {
    const role = String(item?.role || "entry").toUpperCase();
    const text = compactHistoryText(item?.text);
    return `${transcript.length - items.length + index + 1}. ${role}  ${text}`;
  }).join("\n");
}

export function removeStagedContext(stagedContexts = [], target = "") {
  const value = String(target || "").trim();
  if (!value || value.toLowerCase() === "all") {
    const removed = stagedContexts.length;
    stagedContexts.length = 0;
    return { removed, remaining: 0, path: "" };
  }
  const resolved = resolve(value);
  const index = stagedContexts.findIndex((path) => path === resolved || basename(path) === value);
  if (index === -1) return { removed: 0, remaining: stagedContexts.length, path: resolved };
  const [path] = stagedContexts.splice(index, 1);
  return { removed: 1, remaining: stagedContexts.length, path };
}

export function resolveWorkspacePath(value, {
  cwd = process.cwd(),
  workspaceRoot = cwd,
  permissionMode = "standard"
} = {}) {
  const path = String(value || "").trim().replace(/^~(?=[\\/]|$)/, homedir());
  const resolved = resolve(isAbsolute(path) ? path : join(cwd, path));
  if (permissionMode !== "full" && !pathWithinRoot(canonicalPath(resolved), canonicalPath(workspaceRoot))) {
    throw new Error(`Standard access is limited to ${workspaceRoot}.`);
  }
  return resolved;
}

function runReadOnlyCommand(command, args, cwd, environment) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: sanitizedEnvironment(environment),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let output = "";
    const append = (chunk) => {
      output = `${output}${chunk}`.slice(-100_000);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", reject);
    child.on("close", (code) => resolveResult({
      code: Number.isInteger(code) ? code : 1,
      output: output.trim()
    }));
  });
}

function sanitizedEnvironment(environment) {
  const env = { ...environment };
  delete env.VIBYRA_TERMINAL_GATEWAY_TOKEN;
  return env;
}

function compactHistoryText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 137)}...` : text || "(empty)";
}

function clampCount(value) {
  const parsed = Number.parseInt(String(value || "12"), 10);
  return Number.isFinite(parsed) ? Math.min(40, Math.max(1, parsed)) : 12;
}

function hiddenEntry(directory, name) {
  if (HIDDEN_DIRECTORIES.has(name)) return true;
  const relative = `${basename(directory)}/${name}`;
  return HIDDEN_DIRECTORIES.has(relative);
}

function pathWithinRoot(path, root) {
  const base = resolve(String(root || process.cwd()));
  const target = resolve(String(path || base));
  // path.relative is separator- and case-correct per platform, unlike a
  // literal `${base}/` prefix check which never matches Windows backslashes.
  const fromBase = relative(base, target);
  return fromBase === "" || (!fromBase.startsWith("..") && !isAbsolute(fromBase));
}

function canonicalPath(path) {
  let current = resolve(String(path || process.cwd()));
  const suffix = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    suffix.unshift(basename(current));
    current = parent;
  }
  try {
    return resolve(realpathSync(current), ...suffix);
  } catch {
    return resolve(String(path || process.cwd()));
  }
}
