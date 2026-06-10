import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".expo",
  ".next",
  ".nuxt",
  ".output",
  ".vibyra-agent",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "private",
  "secrets",
  "vendor"
]);

export async function discoverProjectAppDirectories(projectPath, markerNames, options = {}) {
  const root = resolve(projectPath);
  const maxDepth = options.maxDepth ?? 4;
  const maxDirectories = options.maxDirectories ?? 240;
  const markers = new Set(markerNames);
  const matches = new Set();
  const queue = [{ path: root, depth: 0 }];
  let visited = 0;

  while (queue.length > 0 && visited < maxDirectories) {
    const current = queue.shift();
    visited += 1;
    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.isFile() && markers.has(entry.name))) {
      matches.add(relative(root, current.path).replaceAll("\\", "/"));
    }
    if (current.depth >= maxDepth) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;
      queue.push({ path: resolve(current.path, entry.name), depth: current.depth + 1 });
    }
  }

  return Array.from(matches).sort((left, right) => (
    directoryDepth(left) - directoryDepth(right) || left.localeCompare(right)
  ));
}

function shouldSkipDirectory(name) {
  return SKIP_DIRECTORIES.has(name) || (name.startsWith(".") && name !== ".storybook");
}

function directoryDepth(directory) {
  return directory ? directory.split("/").length : 0;
}
