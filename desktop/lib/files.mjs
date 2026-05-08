import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { event, pushEvents } from "./state.mjs";
import { discoverProjects, projectById } from "./projects.mjs";

const ignoredDirectories = new Set([
  ".expo",
  ".git",
  ".next",
  ".vibyra-agent",
  "backend/vendor",
  "build",
  "dist",
  "node_modules"
]);
const readableExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml"
]);
const readableNames = new Set(["Dockerfile", "Gemfile", "Makefile", "Procfile"]);
const maxFiles = 80;
const maxDepth = 6;
const maxReadBytes = 500_000;

export async function listProjectFiles(projectId) {
  const project = await requireProject(projectId);
  const files = [];
  await scanFiles(project.path, "", files, 0);
  return files;
}

export async function readProjectFile(projectId, path) {
  const project = await requireProject(projectId);
  const filePath = await safeProjectPath(project.path, path, { mustExist: true });
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error("File not found");
  if (info.size > maxReadBytes) throw new Error("File is too large to open in Vibyra mobile");
  const body = await readFile(filePath, "utf8");
  return makeFileEntry(project.path, filePath, "clean", body);
}

export async function createProjectFile({ projectId, path, content = "" }) {
  const project = await requireProject(projectId);
  const filePath = await safeProjectPath(project.path, path, { mustExist: false });
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, String(content), "utf8");
  const file = makeFileEntry(project.path, filePath, "added", String(content));
  const log = event("Files", `Created ${file.path}`, "success");
  pushEvents([log]);
  const files = (await listProjectFiles(projectId)).map((item) => (item.id === file.id ? file : item));
  return { file, files, events: [log] };
}

async function requireProject(projectId) {
  if (!projectId) throw new Error("No project selected");
  if (projectById(projectId)) return projectById(projectId);
  await discoverProjects();
  const project = projectById(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

async function scanFiles(root, directory, files, depth) {
  if (files.length >= maxFiles || depth > maxDepth) return;

  const absoluteDirectory = resolve(root, directory);
  let entries = [];
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (files.length >= maxFiles) return;
    if (entry.name.startsWith(".") && entry.name !== ".env") continue;

    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (isIgnoredDirectory(relativePath)) continue;
      await scanFiles(root, relativePath, files, depth + 1);
      continue;
    }

    if (!entry.isFile() || !isReadableFile(entry.name)) continue;
    const absolutePath = resolve(root, relativePath);
    files.push(makeFileEntry(root, absolutePath, "clean", ""));
  }
}

async function safeProjectPath(projectPath, inputPath, { mustExist }) {
  const requested = String(inputPath ?? "").trim();
  if (!requested) throw new Error("File path is required");

  const root = resolve(projectPath);
  const filePath = isAbsolute(requested) ? resolve(requested) : resolve(root, requested);
  const pathFromRoot = relative(root, filePath);

  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  if (isIgnoredDirectory(pathFromRoot)) {
    throw new Error("That folder is not available in Vibyra mobile");
  }

  if (mustExist) {
    try {
      await stat(filePath);
    } catch {
      throw new Error("File not found");
    }
  }

  return filePath;
}

function makeFileEntry(root, filePath, changed, body) {
  const path = toPosix(relative(resolve(root), resolve(filePath)));
  return {
    id: Buffer.from(`${resolve(root)}:${path}`).toString("base64url"),
    name: basename(filePath),
    path,
    language: languageFor(filePath),
    changed,
    body
  };
}

function isReadableFile(name) {
  return readableNames.has(name) || readableExtensions.has(extname(name).toLowerCase());
}

function isIgnoredDirectory(path) {
  const normalized = toPosix(path);
  return Array.from(ignoredDirectories).some((ignored) => normalized === ignored || normalized.startsWith(`${ignored}/`));
}

function languageFor(filePath) {
  const ext = extname(filePath).toLowerCase().replace(/^\./, "");
  if (!ext) return basename(filePath).toLowerCase();
  if (ext === "md") return "markdown";
  if (ext === "yml") return "yaml";
  return ext;
}

function toPosix(path) {
  return String(path).replace(/\\/g, "/");
}
