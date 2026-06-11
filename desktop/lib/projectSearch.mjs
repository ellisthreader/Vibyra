import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { projectFromPath } from "./projectInfo.mjs";
import { shouldSkipProjectFolder } from "./projectDiscovery.mjs";
import { folderNameSearchScore, projectSearchScore } from "./searchScoring.mjs";

export async function searchProjectsFromRoots(query, projects, roots) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [];
  const ranked = projects
    .map((project) => ({ project, score: projectSearchScore(project, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name))
    .slice(0, 12)
    .map((item) => item.project);
  const folders = await searchFoldersByName(roots, needle, new Set(ranked.map((project) => project.id)));
  return mergeSearchResults(ranked, folders).slice(0, 20);
}

async function searchFoldersByName(roots, needle, seenIds) {
  const state = { results: [], seenIds, seenPaths: new Set(), visited: 0 };
  for (const root of roots) {
    if (state.results.length >= 20) break;
    await scanFolderMatches(root, needle, state, 0);
  }
  return state.results
    .sort((a, b) => projectSearchScore(b, needle) - projectSearchScore(a, needle) || a.name.localeCompare(b.name))
    .slice(0, 20);
}

async function scanFolderMatches(root, needle, state, depth) {
  if (state.results.length >= 20 || depth > 5 || state.visited > 3000 || state.seenPaths.has(root)) return;
  state.seenPaths.add(root);
  state.visited += 1;
  let children = [];
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const child of children.slice(0, 180)) {
    if (!child.isDirectory() || shouldSkipProjectFolder(child.name)) continue;
    const childPath = join(root, child.name);
    if (folderNameSearchScore(child.name, needle) > 0) await addFolderMatch(childPath, state);
    if (state.results.length >= 20) return;
    await scanFolderMatches(childPath, needle, state, depth + 1);
    if (state.results.length >= 20 || state.visited > 3000) return;
  }
}

async function addFolderMatch(path, state) {
  try {
    const project = await projectFromPath(path);
    if (state.seenIds.has(project.id)) return;
    state.seenIds.add(project.id);
    state.results.push(project);
  } catch {
    // Folders can disappear or become unreadable during a best-effort search.
  }
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
