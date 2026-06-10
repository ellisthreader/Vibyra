import { basename, isAbsolute, resolve } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { analyzeProjectPath } from "./projectAnalysis.mjs";

const rememberedProjectPaths = new Set();

export async function projectFromPath(path) {
  const projectPath = resolve(path);
  const entries = await readdir(projectPath);
  const info = await stat(projectPath);
  return projectFromInfo(projectPath, entries, info, await analyzeProjectPath(projectPath, entries));
}

export function projectFromInfo(path, entries, info, projectAnalysis = {}) {
  const projectPath = rememberProjectPath(path);
  const detectedBrief = projectAnalysis.detectedBrief ?? null;
  return {
    id: projectIdFromPath(projectPath),
    name: basename(projectPath),
    path: projectPath,
    stack: detectedBrief ? `${detectedBrief.kindLabel} · ${detectedBrief.frameworkLabel}` : detectStack(entries),
    updated: formatUpdated(info.mtime),
    source: "desktop",
    analysis: projectAnalysis.analysis,
    detectedBrief,
    briefRequired: true
  };
}

export function projectIdFromPath(path) {
  return Buffer.from(resolve(String(path ?? ""))).toString("base64url");
}

export function projectPathFromId(id) {
  const value = String(id ?? "").trim();
  if (!value) return null;
  if (isAbsolute(value)) return resolve(value);

  try {
    const path = Buffer.from(value, "base64url").toString("utf8");
    if (!path || path.includes("\0") || path.includes("\uFFFD") || !isAbsolute(path)) return null;
    const normalizedId = value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (projectIdFromPath(path) !== normalizedId) return null;
    return resolve(path);
  } catch {
    return null;
  }
}

export function rememberProjectPath(path) {
  const projectPath = resolve(String(path ?? ""));
  rememberedProjectPaths.add(projectPath);
  return projectPath;
}

export function isRememberedProjectPath(path) {
  return rememberedProjectPaths.has(resolve(String(path ?? "")));
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
