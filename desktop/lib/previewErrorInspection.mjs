import { basename, extname, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

const SKIP_DIRS = new Set([".expo", ".git", ".next", ".output", ".vibyra-agent", "backend/vendor", "build", "coverage", "dist", "node_modules", "vendor"]);
const TEXT_EXTS = new Set([".cjs", ".css", ".html", ".js", ".json", ".jsx", ".mjs", ".php", ".svelte", ".ts", ".tsx", ".vue"]);
const MAX_SCAN_FILES = 900;
const MAX_READ_BYTES = 220_000;
const MAX_OCCURRENCES = 18;

export async function readPreviewPackageInfo(root) {
  const path = resolve(root, "package.json");
  const body = await readOptional(path);
  if (!body) return { path: "package.json", exists: false, declared: new Map(), body: "" };
  try {
    const decoded = JSON.parse(body);
    const declared = new Map();
    for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(decoded?.[section] ?? {})) {
        declared.set(name, { section, version: String(version) });
      }
    }
    return { path: "package.json", exists: true, declared, body };
  } catch {
    return { path: "package.json", exists: true, declared: new Map(), body };
  }
}

export async function inspectPreviewPackages(root, missingImports, declared) {
  const related = new Set();
  const missing = [];
  for (const name of missingImports) {
    if (!(await exists(resolve(root, "node_modules", name)))) missing.push(name);
    const scope = name.startsWith("@") ? name.split("/").slice(0, 1).join("/") : "";
    for (const declaredName of declared.keys()) {
      if (scope && declaredName.startsWith(`${scope}/`)) related.add(declaredName);
    }
    if (scope) {
      for (const installedName of await installedScopedPackages(root, scope)) related.add(installedName);
    }
  }
  return { missing, related: Array.from(related).sort() };
}

export async function findMissingImportOccurrences(root, missingImports, prompt) {
  const files = [];
  await collectTextFiles(root, "", files, 0);
  const occurrences = [];
  for (const path of files) {
    const body = await readOptional(resolve(root, path));
    if (!body) continue;
    const lines = body.split(/\r\n|\r|\n/);
    const matches = lines
      .map((line, index) => ({ line, index: index + 1 }))
      .filter(({ line }) => missingImports.some((specifier) => line.includes(specifier)))
      .map(({ line, index }) => `${index}: ${line.trimEnd()}`);
    if (matches.length > 0) occurrences.push({ path, language: languageFor(path), snippet: matches.slice(0, 8).join("\n") });
  }
  return rankOccurrences(occurrences, prompt).slice(0, MAX_OCCURRENCES);
}

export function contextFilesForImportDiagnosis({ packageInfo, occurrences }) {
  const files = [];
  if (packageInfo.exists) {
    files.push({ path: "package.json", language: "json", loaded: true, snippet: packageSnippet(packageInfo) });
  }
  for (const item of occurrences.slice(0, 12)) files.push({ ...item, loaded: true });
  return files;
}

async function collectTextFiles(root, directory, files, depth) {
  if (files.length >= MAX_SCAN_FILES || depth > 8) return;
  let entries = [];
  try {
    entries = await readdir(resolve(root, directory), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => entryPriority(a) - entryPriority(b) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (files.length >= MAX_SCAN_FILES) return;
    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!isIgnoredDirectory(relativePath)) await collectTextFiles(root, relativePath, files, depth + 1);
      continue;
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue;
    try {
      const info = await stat(resolve(root, relativePath));
      if (info.size <= MAX_READ_BYTES) files.push(toPosix(relativePath));
    } catch {
    }
  }
}

function rankOccurrences(occurrences, prompt) {
  const mentioned = extractMentionedPaths(prompt);
  return occurrences
    .map((item, index) => ({ ...item, index, score: occurrenceScore(item.path, mentioned) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ index, score, ...item }) => item);
}

function occurrenceScore(path, mentioned) {
  let score = mentioned.some((item) => item === path || item.endsWith(`/${path}`) || path.endsWith(item)) ? 1000 : 0;
  if (/^resources\/js\/(?:app|bootstrap)\.[jt]sx?$/.test(path)) score += 120;
  if (/^(src|resources\/js)\/(?:main|index|app)\.[jt]sx?$/.test(path)) score += 100;
  if (basename(path).toLowerCase().includes("app.")) score += 20;
  return score;
}

function extractMentionedPaths(prompt) {
  const paths = new Set();
  const pattern = /(?:from|Location:)\s+["']?([^"'\s]+?\.(?:[cm]?[jt]sx?|vue|svelte|css|php|html))/gi;
  let match;
  while ((match = pattern.exec(String(prompt ?? ""))) !== null) paths.add(toPosix(match[1]).replace(/^\/+/, ""));
  return Array.from(paths);
}

function packageSnippet(packageInfo) {
  if (!packageInfo.body) return "";
  try {
    const decoded = JSON.parse(packageInfo.body);
    return JSON.stringify({
      scripts: decoded.scripts ?? {},
      dependencies: decoded.dependencies ?? {},
      devDependencies: decoded.devDependencies ?? {},
      peerDependencies: decoded.peerDependencies ?? {}
    }, null, 2).slice(0, 1600);
  } catch {
    return packageInfo.body.slice(0, 1600);
  }
}

async function installedScopedPackages(root, scope) {
  try {
    const entries = await readdir(resolve(root, "node_modules", scope), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => `${scope}/${entry.name}`);
  } catch {
    return [];
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function entryPriority(entry) {
  if (entry.name === "package.json") return 0;
  if (entry.isDirectory() && ["resources", "src", "app", "components", "pages"].includes(entry.name.toLowerCase())) return 1;
  return entry.isDirectory() ? 2 : 3;
}

function isIgnoredDirectory(path) {
  const normalized = toPosix(path);
  if (basename(normalized).startsWith(".") && basename(normalized) !== ".env") return true;
  return Array.from(SKIP_DIRS).some((ignored) => normalized === ignored || normalized.startsWith(`${ignored}/`));
}

function isTextFile(name) {
  return TEXT_EXTS.has(extname(name).toLowerCase());
}

function languageFor(filePath) {
  const ext = extname(filePath).toLowerCase().replace(/^\./, "");
  return ext === "yml" ? "yaml" : ext || "txt";
}

function toPosix(path) {
  return String(path).replace(/\\/g, "/");
}
