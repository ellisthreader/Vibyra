import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { appState } from "./state.mjs";
import { isDirectory, projectFromPath } from "./projectInfo.mjs";

export { browseDesktopPath } from "./projectBrowse.mjs";
export { createDesktopProject } from "./projectCreate.mjs";

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

  cacheProjects(projects.slice(0, 12));
  return appState.cachedProjects;
}

export function findProjectById(id) {
  return appState.cachedProjects.find((project) => project.id === id) ?? projectFromEncodedId(id);
}

export function projectById(id) {
  return findProjectById(id);
}

export async function listDesktopFolders() {
  return discoverProjects();
}

export async function analyzeDesktopProject(path) {
  return projectFromPath(resolve(String(path ?? "")));
}

export async function searchDesktopProjects(query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [];

  const projects = appState.cachedProjects.length > 0 ? appState.cachedProjects : await discoverProjects();
  const rankedProjects = projects
    .map((project) => ({ project, score: projectSearchScore(project, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name))
    .slice(0, 10)
    .map((item) => item.project);
  const folderMatches = await searchFoldersByName(needle, new Set(rankedProjects.map((project) => project.id)));
  const matches = mergeSearchResults(rankedProjects, folderMatches).slice(0, 10);
  cacheProjects(matches);
  return matches;
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

  projects.push(await projectFromPath(path));
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

async function searchFoldersByName(needle, seenIds) {
  const roots = Array.from(new Set([
    process.cwd(),
    join(homedir(), "Desktop"),
    join(homedir(), "Documents"),
    join(homedir(), "Downloads"),
    join(homedir(), "Code"),
    join(homedir(), "Projects"),
    join(homedir(), "Work")
  ].map((path) => resolve(path))));
  const state = { results: [], seenIds, seenPaths: new Set(), visited: 0 };
  for (const root of roots) {
    if (state.results.length >= 10 || !(await isDirectory(root))) continue;
    await scanFolderMatches(root, needle, state, 0);
  }
  return state.results
    .sort((a, b) => projectSearchScore(b, needle) - projectSearchScore(a, needle) || a.name.localeCompare(b.name))
    .slice(0, 10);
}

async function scanFolderMatches(root, needle, state, depth) {
  if (state.results.length >= 10 || depth > 4 || state.visited > 1200 || state.seenPaths.has(root)) return;
  state.seenPaths.add(root);
  state.visited += 1;

  let children = [];
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const child of children.slice(0, 120)) {
    if (!child.isDirectory() || shouldSkipFolder(child.name)) continue;
    const childPath = join(root, child.name);
    if (child.name.toLowerCase().includes(needle)) {
      try {
        const project = await projectFromPath(childPath);
        if (!state.seenIds.has(project.id)) {
          state.seenIds.add(project.id);
          state.results.push(project);
        }
      } catch {
        // A folder can disappear or be unreadable while scanning; keep searching.
      }
      if (state.results.length >= 10) return;
    }
    await scanFolderMatches(childPath, needle, state, depth + 1);
    if (state.results.length >= 10 || state.visited > 1200) return;
  }
}

function shouldSkipFolder(name) {
  return name.startsWith(".") || ["node_modules", "vendor", "dist", "build", ".expo", ".git", ".vibyra-agent"].includes(name);
}

function mergeSearchResults(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const project of group) {
      if (!project?.id || seen.has(project.id)) continue;
      seen.add(project.id);
      merged.push(project);
    }
  }
  return merged;
}

function cacheProjects(projects) {
  const seen = new Set();
  const next = [];
  for (const project of [...projects, ...appState.cachedProjects]) {
    if (!project?.id || seen.has(project.id)) continue;
    seen.add(project.id);
    next.push(project);
    if (next.length >= 80) break;
  }
  appState.cachedProjects = next;
}

function projectFromEncodedId(id) {
  try {
    const path = Buffer.from(String(id ?? ""), "base64url").toString("utf8");
    if (!isAbsolute(path)) return null;
    return { id, name: basename(path), path, stack: "Project", updated: "Now", source: "desktop" };
  } catch {
    return null;
  }
}
