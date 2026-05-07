import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readdir, stat } from "node:fs/promises";
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
  return findProjectById(id) ?? appState.cachedProjects[0];
}

async function scanChildren(root, seen, projects) {
  try {
    const children = await readdir(root, { withFileTypes: true });
    for (const child of children.slice(0, 60)) {
      if (!child.isDirectory() || child.name.startsWith(".")) continue;
      await maybeAddProject(join(root, child.name), seen, projects);
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
  projects.push({
    id: Buffer.from(path).toString("base64url"),
    name: basename(path),
    path,
    stack: detectStack(entries),
    updated: formatUpdated(info.mtime)
  });
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

function formatUpdated(date) {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
