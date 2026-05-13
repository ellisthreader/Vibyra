import { basename } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { analyzeProjectPath } from "./projectAnalysis.mjs";

export async function projectFromPath(path) {
  const entries = await readdir(path);
  const info = await stat(path);
  return projectFromInfo(path, entries, info, await analyzeProjectPath(path, entries));
}

export function projectFromInfo(path, entries, info, projectAnalysis = {}) {
  const detectedBrief = projectAnalysis.detectedBrief ?? null;
  return {
    id: Buffer.from(path).toString("base64url"),
    name: basename(path),
    path,
    stack: detectedBrief ? `${detectedBrief.kindLabel} · ${detectedBrief.frameworkLabel}` : detectStack(entries),
    updated: formatUpdated(info.mtime),
    source: "desktop",
    analysis: projectAnalysis.analysis,
    detectedBrief,
    briefRequired: true
  };
}

export async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export function formatUpdated(date) {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function detectStack(entries) {
  if (entries.includes("app.json")) return "Expo React Native";
  if (entries.includes("package.json")) return "Node / React";
  if (entries.includes("pyproject.toml")) return "Python";
  if (entries.includes("requirements.txt")) return "Python";
  return "Project";
}
