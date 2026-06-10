import { createHash } from "node:crypto";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { terminalEditorWorkspace } from "./ptyTerminals.mjs";
import { readBody, send } from "./http.mjs";

const MAX_EDITOR_BYTES = 2_000_000;
const MAX_EDITOR_FILES = 2_000;
const MAX_EDITOR_DEPTH = 10;
const ignoredDirectories = new Set([
  ".expo", ".git", ".next", ".vibyra-agent", "build", "dist", "node_modules", "vendor"
]);
const readableExtensions = new Set([
  ".c", ".cc", ".cpp", ".cjs", ".css", ".env", ".go", ".h", ".hpp", ".html",
  ".java", ".js", ".json", ".jsx", ".kt", ".kts", ".md", ".mjs", ".php", ".py",
  ".rb", ".rs", ".sh", ".sql", ".svelte", ".swift", ".toml", ".ts", ".tsx", ".txt",
  ".vue", ".xml", ".yaml", ".yml"
]);
const readableNames = new Set([
  "Dockerfile", "Gemfile", "Makefile", "Procfile", "README", "LICENSE"
]);

export async function handleTerminalEditorRoutes(req, res, url) {
  const route = terminalEditorRoute(url.pathname);
  if (!route) return false;
  const workspace = terminalEditorWorkspace(route.id);
  if (req.method === "GET" && route.action === "files") {
    send(res, 200, {
      workspace: workspaceLabel(workspace),
      files: await listTerminalEditorFilesAtRoot(workspace.cwd)
    });
    return true;
  }
  if (req.method === "GET" && route.action === "file") {
    send(res, 200, {
      workspace: workspaceLabel(workspace),
      file: await readTerminalEditorFileAtRoot(
        workspace.cwd,
        url.searchParams.get("path"),
        url.searchParams.get("line"),
        url.searchParams.get("column")
      )
    });
    return true;
  }
  if (req.method === "PUT" && route.action === "file") {
    const body = await readBody(req);
    send(res, 200, {
      workspace: workspaceLabel(workspace),
      file: await saveTerminalEditorFileAtRoot(
        workspace.cwd,
        body.path,
        body.content,
        body.baseRevision
      )
    });
    return true;
  }
  return false;
}

export async function listTerminalEditorFilesAtRoot(rootPath) {
  const root = await realpath(resolve(rootPath));
  const files = [];
  await scanEditorFiles(root, root, files, 0);
  return files;
}

export async function readTerminalEditorFileAtRoot(rootPath, inputPath, line = 1, column = 1) {
  const { root, filePath } = await safeEditorFile(rootPath, inputPath);
  const info = await stat(filePath);
  if (!info.isFile()) throw editorError(404, "File not found.");
  if (!isReadableEditorFile(basename(filePath))) throw editorError(415, "This file type cannot be opened in the editor.");
  if (info.size > MAX_EDITOR_BYTES) throw editorError(413, "This file is too large for the editor.");
  const content = await readFile(filePath, "utf8");
  if (content.includes("\u0000")) throw editorError(415, "Binary files cannot be opened in the editor.");
  return editorFile(root, filePath, content, line, column);
}

export async function saveTerminalEditorFileAtRoot(rootPath, inputPath, content, baseRevision) {
  const current = await readTerminalEditorFileAtRoot(rootPath, inputPath);
  if (!baseRevision || current.revision !== String(baseRevision)) {
    throw editorError(409, "This file changed on disk. Refresh it before saving.");
  }
  const nextContent = String(content ?? "");
  if (nextContent.includes("\u0000")) throw editorError(415, "Binary content cannot be saved in the editor.");
  if (Buffer.byteLength(nextContent, "utf8") > MAX_EDITOR_BYTES) {
    throw editorError(413, "This file is too large for the editor.");
  }
  const { root, filePath } = await safeEditorFile(rootPath, inputPath);
  await writeFile(filePath, nextContent, "utf8");
  return editorFile(root, filePath, nextContent, 1, 1);
}

async function scanEditorFiles(root, directory, files, depth) {
  if (files.length >= MAX_EDITOR_FILES || depth > MAX_EDITOR_DEPTH) return;
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (files.length >= MAX_EDITOR_FILES) return;
    const entryPath = resolve(directory, entry.name);
    const path = toPosix(relative(root, entryPath));
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await scanEditorFiles(root, entryPath, files, depth + 1);
      continue;
    }
    if (entry.isFile()) {
      files.push({
        path,
        name: entry.name,
        language: languageFor(entry.name),
        openable: isReadableEditorFile(entry.name)
      });
    }
  }
}

async function safeEditorFile(rootPath, inputPath) {
  const requested = String(inputPath || "").trim().replace(/^file:\/\//, "");
  if (!requested) throw editorError(422, "File path is required.");
  const root = await realpath(resolve(rootPath));
  const candidate = isAbsolute(requested) ? resolve(requested) : resolve(root, requested);
  const filePath = await realpath(candidate).catch(() => {
    throw editorError(404, "File not found.");
  });
  const fromRoot = relative(root, filePath);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw editorError(403, "File path must stay inside this terminal workspace.");
  }
  if (toPosix(fromRoot).split("/").some((part) => ignoredDirectories.has(part))) {
    throw editorError(403, "That folder is not available in the editor.");
  }
  return { root, filePath };
}

function editorFile(root, filePath, content, line, column) {
  const path = toPosix(relative(root, filePath));
  return {
    path,
    name: path.split("/").pop() || path,
    language: languageFor(filePath),
    content,
    revision: revisionFor(content),
    line: positiveInteger(line),
    column: positiveInteger(column)
  };
}

function workspaceLabel(workspace) {
  return {
    terminalId: workspace.id,
    title: workspace.title,
    root: workspace.cwd,
    branchName: workspace.branchName || "",
    workspaceMode: workspace.workspaceMode || "shared"
  };
}

function terminalEditorRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "desktop" || parts[1] !== "terminal-editor" || parts.length !== 4) return null;
  const action = parts[3] === "files" ? "files" : parts[3] === "file" ? "file" : "";
  return action ? { id: decodeURIComponent(parts[2]), action } : null;
}

function isReadableEditorFile(name) {
  return readableNames.has(name) || readableExtensions.has(extname(name).toLowerCase());
}

function languageFor(filePath) {
  const extension = extname(filePath).toLowerCase().replace(/^\./, "");
  if (extension === "yml") return "yaml";
  if (extension === "md") return "markdown";
  return extension || String(filePath).split("/").pop()?.toLowerCase() || "text";
}

function revisionFor(content) {
  return createHash("sha256").update(String(content)).digest("hex");
}

function positiveInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function editorError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}
