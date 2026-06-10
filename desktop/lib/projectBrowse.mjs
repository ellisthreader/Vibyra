import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { appState } from "./state.mjs";
import { formatUpdated, isDirectory, projectFromInfo, projectFromPath, projectIdFromPath } from "./projectInfo.mjs";

export async function browseDesktopPath(path) {
  const targetPath = path ? resolve(String(path)) : null;
  if (!targetPath) {
    const roots = await browseRoots();
    cacheProjects(roots);
    return { current: null, parentPath: null, entries: roots.map((project) => ({ ...project, kind: "folder" })) };
  }

  const folderPath = await folderPathForBrowse(targetPath);
  if (!folderPath) throw new Error("Folder is not available");
  const current = await projectFromPath(folderPath);
  const entries = await browseChildren(folderPath);
  cacheProjects([current, ...entries.filter((entry) => entry.kind === "folder")]);
  return {
    current,
    parentPath: await isDirectory(dirname(folderPath)) ? dirname(folderPath) : null,
    entries
  };
}

async function folderPathForBrowse(targetPath) {
  try {
    const info = await stat(targetPath);
    if (info.isDirectory()) return targetPath;
    if (info.isFile()) {
      const parentPath = dirname(targetPath);
      return await isDirectory(parentPath) ? parentPath : null;
    }
  } catch {
  }
  return null;
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
  const uniqueCandidates = Array.from(new Set(candidates.map((path) => resolve(path))));
  const roots = await Promise.all(uniqueCandidates.map(browseRoot));
  return roots.filter(Boolean);
}

async function browseRoot(path) {
  try {
    return (await isDirectory(path)) ? projectFromPath(path) : null;
  } catch {
    return null;
  }
}

async function browseChildren(root) {
  let children = [];
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const visibleChildren = children
    .filter((child) => !child.name.startsWith(".") && (child.isDirectory() || child.isFile()))
    .slice(0, 200);

  const entries = await mapWithConcurrency(visibleChildren, 24, (child) => browseEntry(root, child));
  return entries
    .filter(Boolean)
    .sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name));
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function browseEntry(root, child) {
  const childPath = join(root, child.name);
  let info;
  try {
    info = await stat(childPath);
  } catch {
    return null;
  }
  if (child.isDirectory()) {
    return { ...projectFromInfo(childPath, [], info), kind: "folder" };
  }
  if (!child.isFile()) return null;
  return {
    id: projectIdFromPath(childPath),
    name: child.name,
    path: childPath,
    kind: "file",
    stack: "File",
    updated: formatUpdated(info.mtime),
    source: "desktop"
  };
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
