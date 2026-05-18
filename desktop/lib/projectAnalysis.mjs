import { extname, join, relative } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { detectBrief, techEvidence } from "./projectAnalysisBrief.mjs";
import { cleanText, formatDescriptionSummary, readPackageMetadata, readTextMetadata, selectProjectTitle } from "./projectAnalysisMetadata.mjs";
import { detectProjectPurpose } from "./projectAnalysisPurpose.mjs";

const SKIP_DIRS = new Set([".git", ".expo", ".next", ".vibyra-agent", "build", "dist", "node_modules", "vendor"]);
const TEXT_EXTS = new Set([".css", ".gd", ".html", ".js", ".jsx", ".json", ".md", ".php", ".ts", ".tsx", ".vue", ".svelte", ".yaml", ".yml"]);
export const PROJECT_ANALYSIS_VERSION = 2;

export async function analyzeProjectPath(rootPath, rootEntries = []) {
  const startPath = await projectRootPath(rootPath, rootEntries);
  const startEntries = startPath === rootPath ? rootEntries : await safeReaddir(startPath);
  const scan = await collectSignals(startPath, startEntries);
  const purpose = detectProjectPurpose(scan);
  const detectedBrief = detectBrief(scan, purpose);
  return {
    analysis: summarize(scan, detectedBrief, purpose),
    detectedBrief
  };
}

async function collectSignals(rootPath, rootEntries) {
  const state = {
    dirs: 0,
    files: 0,
    names: new Set(rootEntries),
    packages: [],
    snippets: [],
    titles: [cleanText(rootPath.split("/").pop() ?? "")],
    descriptions: [],
    descriptionEvidence: [],
    evidence: [],
    rootName: cleanText(rootPath.split("/").pop() ?? "")
  };
  const queue = [{ path: rootPath, depth: 0 }];
  await inspectRootMarkers(rootPath, rootEntries, state);

  while (queue.length && state.dirs < 36 && state.files < 96) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => entryPriority(a.name) - entryPriority(b.name) || a.name.localeCompare(b.name));
    state.dirs += 1;
    for (const entry of entries.slice(0, 120)) {
      const fullPath = join(current.path, entry.name);
      const rel = relative(rootPath, fullPath) || entry.name;
      state.names.add(entry.name);
      if (entry.isDirectory() && current.depth < 3 && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        queue.push({ path: fullPath, depth: current.depth + 1 });
      }
      if (entry.isFile()) await inspectFile(fullPath, rel, entry.name, state);
      if (state.files >= 48) break;
    }
  }

  return state;
}

async function projectRootPath(rootPath, rootEntries) {
  let currentPath = rootPath;
  let entries = rootEntries;
  for (let depth = 0; depth < 4; depth += 1) {
    if (hasMarker(entries)) return currentPath;
    const visibleDirs = [];
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      try {
        const childEntries = await readdir(join(currentPath, name), { withFileTypes: true });
        if (childEntries.length >= 0) visibleDirs.push({ name, entries: childEntries.map((entry) => entry.name) });
      } catch {
        // Ignore non-directories and unreadable folders.
      }
    }
    if (visibleDirs.length !== 1) return currentPath;
    currentPath = join(currentPath, visibleDirs[0].name);
    entries = visibleDirs[0].entries;
  }
  return currentPath;
}

async function safeReaddir(path) {
  try {
    return (await readdir(path)).map(String);
  } catch { return []; }
}

async function inspectRootMarkers(rootPath, entries, state) {
  const priority = entries.filter(isPriorityName);
  for (const name of priority.slice(0, 16)) await inspectFile(join(rootPath, name), name, name, state);
}

function hasMarker(entries) {
  return entries.some(isMarkerName);
}

function isPriorityName(name) {
  return isMarkerName(name) || name.toLowerCase().includes("readme");
}

function isMarkerName(name) {
  return ["package.json", "index.html", "app.json", "artisan", "manage.py", "angular.json", "pubspec.yaml", "project.godot", "ProjectSettings"].includes(name)
    || name.startsWith("gatsby-config.")
    || name.endsWith(".config.js") || name.endsWith(".config.mjs") || name.endsWith(".config.ts");
}

async function inspectFile(path, rel, name, state) {
  if (state.files >= 96 || name.endsWith(".lock")) return;
  const ext = extname(name).toLowerCase();
  if (name !== "package.json" && !TEXT_EXTS.has(ext)) return;
  state.files += 1;

  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {
    return;
  }
  const sample = text.slice(0, 4096);
  state.snippets.push(sample.toLowerCase());
  state.evidence.push(rel);

  if (name === "package.json") readPackageMetadata(sample, rel, state);
  readTextMetadata(sample, rel, name, ext, state);
}

function summarize(scan, detectedBrief, purpose) {
  const title = selectProjectTitle(scan.titles, scan.rootName);
  const description = scan.descriptions.find(Boolean);
  const summary = description
    ? formatDescriptionSummary(title, description)
    : title
    ? `${title}${purpose?.label ? ` looks like ${purpose.label}` : ""}.`
    : purpose?.label ? `This looks like ${purpose.label}.` : "I could not infer a specific purpose from the sampled files.";
  const evidence = description
    ? [...scan.descriptionEvidence, ...(purpose?.evidence ?? [])]
    : purpose?.evidence?.length ? purpose.evidence : scan.evidence;
  return {
    analyzerVersion: PROJECT_ANALYSIS_VERSION,
    confidence: purpose?.confidence ?? (detectedBrief ? "medium" : "low"),
    evidence: Array.from(new Set(evidence)).slice(0, 8),
    filesSampled: scan.files,
    foldersScanned: scan.dirs,
    summary,
    techEvidence: techEvidence(scan, detectedBrief)
  };
}

function entryPriority(name) {
  const lower = name.toLowerCase();
  if (["routes", "resources", "app", "src", "pages", "components", "models", "controllers"].includes(lower)) return 0;
  if (["web.php", "app.tsx", "app.jsx", "index.html", "package.json", "composer.json", "angular.json", "pubspec.yaml", "project.godot"].includes(lower)) return 1;
  if (lower.includes("page") || lower.includes("home") || lower.includes("menu") || lower.includes("dashboard")) return 2;
  if (["config", "database", "tests", "public", "storage", "bootstrap"].includes(lower)) return 5;
  return 3;
}
