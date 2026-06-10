import { access } from "node:fs/promises";
import { resolve } from "node:path";

export const WEB_APP_DIRECTORIES = [
  "",
  "frontend",
  "client",
  "web",
  "website",
  "site",
  "ui",
  "dashboard",
  "app",
  "apps/web",
  "apps/client",
  "packages/app",
  "packages/web"
];

export const RUNTIME_APP_DIRECTORIES = [
  "",
  "backend",
  "server",
  "service",
  "api",
  "apps/api",
  "packages/api",
  ...WEB_APP_DIRECTORIES.slice(1)
];

export const UNSUPPORTED_RUNTIME_MARKERS = [
  { marker: "Gemfile", runtime: "Ruby/Rails" },
  { marker: "go.mod", runtime: "Go" },
  { marker: "Cargo.toml", runtime: "Rust" },
  { marker: "mix.exs", runtime: "Elixir/Phoenix" },
  { marker: "pom.xml", runtime: "Java" },
  { marker: "build.gradle", runtime: "Java/Gradle" },
  { marker: "build.gradle.kts", runtime: "Java/Gradle" }
];

export async function existingProjectAppRoots(projectPath, directories, markerNames) {
  const roots = [];
  for (const directory of Array.from(new Set(directories))) {
    const path = resolve(projectPath, directory);
    if (await hasAnyMarker(path, markerNames)) roots.push({ directory, path });
  }
  return roots;
}

export async function firstExistingProjectMarker(projectPath, directories, markers) {
  for (const directory of Array.from(new Set(directories))) {
    const path = resolve(projectPath, directory);
    for (const item of markers) {
      try {
        await access(resolve(path, item.marker));
        return { ...item, directory, path };
      } catch {
        // Try the next recognized marker.
      }
    }
  }
  return null;
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
