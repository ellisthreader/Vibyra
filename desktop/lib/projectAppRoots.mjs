import { access } from "node:fs/promises";
import { resolve } from "node:path";

export const WEB_APP_DIRECTORIES = [
  "",
  "frontend",
  "client",
  "web",
  "app",
  "apps/web",
  "packages/web"
];

export const RUNTIME_APP_DIRECTORIES = [
  "",
  "backend",
  "server",
  "api",
  "apps/api",
  "packages/api",
  ...WEB_APP_DIRECTORIES.slice(1)
];

export async function existingProjectAppRoots(projectPath, directories, markerNames) {
  const roots = [];
  for (const directory of Array.from(new Set(directories))) {
    const path = resolve(projectPath, directory);
    if (await hasAnyMarker(path, markerNames)) roots.push({ directory, path });
  }
  return roots;
}

async function hasAnyMarker(root, markerNames) {
  for (const marker of markerNames) {
    try {
      await access(resolve(root, marker));
      return true;
    } catch {
      // Try the next recognized manifest.
    }
  }
  return false;
}
