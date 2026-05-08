import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { appState } from "./state.mjs";

export async function discoverProjects() {
  const roots = [
    process.cwd(),
    join(homedir(), "Desktop"),
    join(homedir(), "Code"),
    join(homedir(), "Projects"),
    join(homedir(), "Work")
  ];
  const seen = new Set();
  const projects = [];

  for (const root of roots) {
    if (!(await isDirectory(root))) continue;
    await maybeAddProject(root, seen, projects);
    await scanChildren(root, seen, projects);
  }

  appState.cachedProjects = projects.slice(0, 12);
  return appState.cachedProjects;
}

export function findProjectById(id) {
  return appState.cachedProjects.find((project) => project.id === id) ?? null;
}

export function projectById(id) {
  return findProjectById(id);
}

export async function listDesktopFolders() {
  return discoverProjects();
}

export async function browseDesktopPath(path) {
  const targetPath = path ? resolve(String(path)) : null;
  if (!targetPath) {
    const roots = await browseRoots();
    cacheProjects(roots);
    return { current: null, parentPath: null, entries: roots.map((project) => ({ ...project, kind: "folder" })) };
  }

  if (!(await isDirectory(targetPath))) throw new Error("Folder is not available");
  const current = await projectFromPath(targetPath);
  const entries = await browseChildren(targetPath);
  cacheProjects([current, ...entries.filter((entry) => entry.kind === "folder")]);
  return {
    current,
    parentPath: await isDirectory(dirname(targetPath)) ? dirname(targetPath) : null,
    entries
  };
}

export async function searchDesktopProjects(query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [];

  const projects = appState.cachedProjects.length > 0 ? appState.cachedProjects : await discoverProjects();
  return projects
    .map((project) => ({ project, score: projectSearchScore(project, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name))
    .slice(0, 10)
    .map((item) => item.project);
}

export async function createDesktopProject(name = "Untitled Workspace") {
  const root = join(homedir(), "Desktop", "Vibyra Projects");
  await mkdir(root, { recursive: true });

  const baseName = sanitizeProjectName(name);
  const projectPath = await uniqueProjectPath(root, baseName);
  await mkdir(projectPath, { recursive: true });
  await writeFile(
    join(projectPath, "package.json"),
    `${JSON.stringify({ private: true, name: packageName(basename(projectPath)), version: "0.1.0" }, null, 2)}\n`,
    { flag: "wx" }
  );
  await writeFile(
    join(projectPath, "README.md"),
    `# ${basename(projectPath)}\n\nCreated from Vibyra mobile.\n`,
    { flag: "wx" }
  );

  const project = await projectFromPath(projectPath);
  if (!project) throw new Error("Could not create project");
  appState.cachedProjects = [project, ...appState.cachedProjects.filter((item) => item.id !== project.id)].slice(0, 12);
  return project;
}

async function scanChildren(root, seen, projects) {
  try {
    const children = await readdir(root, { withFileTypes: true });
    for (const child of children.slice(0, 60)) {
      if (!child.isDirectory() || child.name.startsWith(".")) continue;
      const childPath = join(root, child.name);
      await maybeAddProject(childPath, seen, projects);
      if (child.name === "Vibyra Projects") {
        await scanChildren(childPath, seen, projects);
      }
    }
  } catch {
    // Discovery is best effort so one locked folder cannot block pairing.
  }
}

async function maybeAddProject(path, seen, projects) {
  if (seen.has(path)) return;
  seen.add(path);

  let entries = [];
  try {
    entries = await readdir(path);
  } catch {
    return;
  }

  const markers = ["package.json", ".git", "app.json", "requirements.txt", "pyproject.toml"];
  if (!markers.some((marker) => entries.includes(marker))) return;

  const info = await stat(path);
  projects.push(projectFromInfo(path, entries, info));
}

async function projectFromPath(path) {
  const entries = await readdir(path);
  const info = await stat(path);
  return projectFromInfo(path, entries, info);
}

async function browseRoots() {
  const candidates = [
    homedir(),
    join(homedir(), "Desktop"),
    join(homedir(), "Documents"),
    join(homedir(), "Downloads"),
    join(homedir(), "Code"),
    join(homedir(), "Projects"),
    join(homedir(), "Work")
  ];
  const seen = new Set();
  const roots = [];
  for (const candidate of candidates) {
    const path = resolve(candidate);
    if (seen.has(path) || !(await isDirectory(path))) continue;
    seen.add(path);
    roots.push(await projectFromPath(path));
  }
  return roots;
}

async function browseChildren(root) {
  let children = [];
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const entries = [];
  for (const child of children) {
    if (entries.length >= 200) break;
    if (child.name.startsWith(".")) continue;
    const childPath = join(root, child.name);
    let info;
    try {
      info = await stat(childPath);
    } catch {
      continue;
    }

    if (child.isDirectory()) {
      entries.push({
        ...projectFromInfo(childPath, [], info),
        kind: "folder"
      });
      continue;
    }

    if (child.isFile()) {
      entries.push({
        id: Buffer.from(childPath).toString("base64url"),
        name: child.name,
        path: childPath,
        kind: "file",
        stack: "File",
        updated: formatUpdated(info.mtime),
        source: "desktop"
      });
    }
  }
  return entries.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name));
}

function cacheProjects(projects) {
  const next = [];
  const seen = new Set();
  for (const project of [...projects, ...appState.cachedProjects]) {
    if (!project?.id || seen.has(project.id)) continue;
    seen.add(project.id);
    const { kind, ...cleanProject } = project;
    next.push(cleanProject);
    if (next.length >= 80) break;
  }
  appState.cachedProjects = next;
}

function projectFromInfo(path, entries, info) {
  return {
    id: Buffer.from(path).toString("base64url"),
    name: basename(path),
    path,
    stack: detectStack(entries),
    updated: formatUpdated(info.mtime),
    source: "desktop"
  };
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function detectStack(entries) {
  if (entries.includes("app.json")) return "Expo React Native";
  if (entries.includes("package.json")) return "Node / React";
  if (entries.includes("pyproject.toml")) return "Python";
  if (entries.includes("requirements.txt")) return "Python";
  return "Project";
}

async function uniqueProjectPath(root, baseName) {
  let candidate = join(root, baseName);
  let suffix = 2;
  while (await isDirectory(candidate)) {
    candidate = join(root, `${baseName}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

function sanitizeProjectName(name) {
  const cleaned = String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "Untitled Workspace";
}

function packageName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vibyra-workspace";
}

function projectSearchScore(project, needle) {
  const name = project.name.toLowerCase();
  const path = project.path.toLowerCase();
  const stack = project.stack.toLowerCase();

  if (name === needle) return 100;
  if (name.startsWith(needle)) return 80;
  if (name.includes(needle)) return 60;
  if (path.includes(needle)) return 40;
  if (stack.includes(needle)) return 20;
  return 0;
}

function formatUpdated(date) {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
