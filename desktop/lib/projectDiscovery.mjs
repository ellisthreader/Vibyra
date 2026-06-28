import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { isDirectory, projectFromPath } from "./projectInfo.mjs";

const PROJECT_MARKERS = new Set([
  ".git", "Cargo.toml", "Gemfile", "app.json", "artisan", "composer.json",
  "go.mod", "index.html", "package.json", "pom.xml", "pyproject.toml", "requirements.txt"
]);

export function desktopProjectRoots(recentPaths = []) {
  return Array.from(new Set([
    ...recentPaths,
    process.cwd(),
    join(homedir(), "Desktop"),
    join(homedir(), "Documents"),
    join(homedir(), "Downloads"),
    join(homedir(), "Code"),
    join(homedir(), "Projects"),
    join(homedir(), "Work")
  ].map((path) => resolve(path))));
}

export function plainProjectContainerRoots(home = homedir()) {
  return [
    join(home, "Desktop"),
    join(home, "Documents"),
    join(home, "Downloads"),
    join(home, "Code"),
    join(home, "Projects"),
    join(home, "Work")
  ].map((path) => resolve(path));
}

export async function discoverProjectsFromRoots(roots, selectedRoots = [], options = {}) {
  const projects = [];
  const seen = new Set();
  const state = { scanned: new Set(), visited: 0 };
  const selected = new Set(selectedRoots.map((path) => resolve(path)));
  const plainContainers = new Set((options.plainProjectContainerRoots ?? plainProjectContainerRoots())
    .map((path) => resolve(path)));
  for (const root of roots) {
    if (!(await isDirectory(root))) continue;
    await maybeAddProject(root, seen, projects, selected.has(root));
    await scanChildren(root, seen, projects, state, 0, plainContainers.has(resolve(root)));
  }
  return projects;
}

async function scanChildren(root, seen, projects, state, depth, includePlainChildren = false) {
  if (depth > 2 || state.visited >= 1600 || projects.length >= 80 || state.scanned.has(root)) return;
  state.scanned.add(root);
  state.visited += 1;
  let children = [];
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const child of children.slice(0, 160)) {
    if (!child.isDirectory() || shouldSkipProjectFolder(child.name)) continue;
    const childPath = join(root, child.name);
    await maybeAddProject(childPath, seen, projects, includePlainChildren && depth === 0);
    await scanChildren(childPath, seen, projects, state, depth + 1);
    if (state.visited >= 1600 || projects.length >= 80) return;
  }
}

async function maybeAddProject(path, seen, projects, force = false) {
  if (seen.has(path)) return;
  seen.add(path);
  let entries = [];
  try {
    entries = await readdir(path);
  } catch {
    return;
  }
  if (!force && !entries.some((entry) => PROJECT_MARKERS.has(entry))) return;
  projects.push(await projectFromPath(path));
}

export function shouldSkipProjectFolder(name) {
  return name.startsWith(".")
    || ["node_modules", "vendor", "dist", "build", ".expo", ".git", ".vibyra-agent"].includes(name);
}
