import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { appState } from "./state.mjs";
import {
  isRememberedProjectPath,
  projectFromInfo,
  projectFromPath,
  projectPathFromId
} from "./projectInfo.mjs";
import { browseDesktopPath } from "./projectBrowse.mjs";
import { desktopProjectRoots, discoverProjectsFromRoots } from "./projectDiscovery.mjs";
import { recentProjectPaths, rememberRecentProject } from "./projectRecents.mjs";
import { searchProjectsFromRoots } from "./projectSearch.mjs";

export { browseDesktopPath };
export { createDesktopProject } from "./projectCreate.mjs";

export const FULL_PC_PROJECT_ID = "full-pc";

export async function discoverProjects() {
  const recentPaths = await recentProjectPaths();
  cacheProjects(await discoverProjectsFromRoots(desktopProjectRoots(recentPaths), recentPaths));
  return appState.cachedProjects;
}

export function findProjectById(id, projectPath = null) {
  const value = String(id ?? "").trim();
  const cached = appState.cachedProjects.find((project) => project.id === value);
  if (cached) return cached;

  const fallbackPath = projectPath ? resolve(String(projectPath)) : null;
  const cachedByPath = fallbackPath
    ? appState.cachedProjects.find((project) => resolve(project.path) === fallbackPath)
    : null;
  if (cachedByPath) return cachedByPath;

  const candidatePath = fallbackPath ?? projectPathFromId(value);
  if (!candidatePath || !isTrustedProjectDirectory(candidatePath)) return null;

  try {
    const info = statSync(candidatePath);
    const project = projectFromInfo(candidatePath, readdirSync(candidatePath), info);
    cacheProjects([project]);
    return project;
  } catch {
    return null;
  }
}

export function projectById(id, projectPath = null) {
  return findProjectById(id, projectPath);
}

export async function resolveDesktopProject(id, projectPath = null) {
  const existing = projectById(id, projectPath);
  if (existing) return existing;
  await discoverProjects();
  return projectById(id, projectPath);
}

export function terminalProjectById(id) {
  return id === FULL_PC_PROJECT_ID ? fullPcProject() : findProjectById(id);
}

export async function listDesktopFolders() {
  return discoverProjects();
}

export async function analyzeDesktopProject(path) {
  const project = await projectFromPath(resolve(String(path ?? "")));
  cacheProjects([project]);
  return project;
}

export async function selectDesktopProject(path) {
  const result = await browseDesktopPath(path);
  if (!result.current) throw new Error("No project folder was selected.");
  await rememberRecentProject(result.current.path);
  cacheProjects([result.current]);
  return result.current;
}

export async function searchDesktopProjects(query) {
  const projects = appState.cachedProjects.length > 0 ? appState.cachedProjects : await discoverProjects();
  const matches = await searchProjectsFromRoots(
    query,
    projects,
    desktopProjectRoots(await recentProjectPaths())
  );
  cacheProjects(matches);
  return matches;
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

function isTrustedProjectDirectory(path) {
  if (!existsSync(path)) return false;
  try {
    if (!statSync(path).isDirectory()) return false;
    if (isRememberedProjectPath(path)) return true;
    const entries = new Set(readdirSync(path));
    if ([
      ".git",
      "app.json",
      "artisan",
      "composer.json",
      "index.html",
      "package.json",
      "pyproject.toml",
      "requirements.txt"
    ].some((marker) => entries.has(marker))) return true;
    return ["build/index.html", "dist/index.html", "public/index.html", "public/index.php"]
      .some((entry) => existsSync(join(path, entry)));
  } catch {
    return false;
  }
}

function fullPcProject() {
  return {
    id: FULL_PC_PROJECT_ID,
    name: "Full PC",
    path: homedir(),
    stack: "Computer",
    updated: "Now",
    source: "desktop",
    briefRequired: false
  };
}
