import { basename, extname, relative, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { discoverProjects, projectById } from "./projects.mjs";

const SKIP_DIRS = new Set([".expo", ".git", ".next", ".output", ".vibyra-agent", "backend/vendor", "build", "coverage", "dist", "node_modules", "vendor"]);
const TEXT_EXTS = new Set([".cjs", ".css", ".env", ".html", ".js", ".json", ".jsx", ".less", ".md", ".mjs", ".php", ".py", ".scss", ".sass", ".svelte", ".toml", ".ts", ".tsx", ".txt", ".vue", ".yaml", ".yml"]);
const TEXT_NAMES = new Set(["Dockerfile", "Gemfile", "Makefile", "Procfile"]);
const MAX_CANDIDATES = 800;
const MAX_CONTEXT_FILES = 300;
const MAX_SNIPPETS = 16;
const MAX_READ_BYTES = 220_000;

export async function promptProjectContext(projectId, prompt = "") {
  const project = await requireProject(projectId);
  const files = [];
  await scanContextFiles(project.path, "", files, 0);
  const ranked = rankFiles(files, String(prompt ?? ""));
  const snippetPaths = new Set(ranked.slice(0, MAX_SNIPPETS).map((item) => item.path));
  const context = [];

  for (const item of ranked.slice(0, MAX_CONTEXT_FILES)) {
    const entry = { path: item.path, language: item.language, loaded: false };
    if (snippetPaths.has(item.path)) {
      const snippet = await snippetFor(project.path, item.path, prompt);
      if (snippet) {
        entry.loaded = true;
        entry.snippet = snippet;
      }
    }
    context.push(entry);
  }

  return { files: context, scanned: files.length };
}

export async function promptProjectFilePaths(projectId, prompt = "", limit = 12) {
  const project = await requireProject(projectId);
  const files = [];
  await scanContextFiles(project.path, "", files, 0);
  return rankFiles(files, String(prompt ?? ""))
    .filter((item) => !sensitiveContextPath(item.path))
    .slice(0, Math.max(1, Math.min(24, Number(limit) || 12)))
    .map((item) => ({ path: item.path, language: item.language }));
}

async function requireProject(projectId) {
  if (!projectId) throw new Error("No project selected");
  if (projectById(projectId)) return projectById(projectId);
  await discoverProjects();
  const project = projectById(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

async function scanContextFiles(root, directory, files, depth) {
  if (files.length >= MAX_CANDIDATES || depth > 8) return;
  const absoluteDirectory = resolve(root, directory);
  let entries = [];
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => entryPriority(a) - entryPriority(b) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (files.length >= MAX_CANDIDATES) return;
    if (entry.name.startsWith(".") && entry.name !== ".env") continue;
    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!isIgnoredDirectory(relativePath)) await scanContextFiles(root, relativePath, files, depth + 1);
      continue;
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue;
    const absolutePath = resolve(root, relativePath);
    try {
      const info = await stat(absolutePath);
      if (info.size > MAX_READ_BYTES) continue;
      files.push({ path: toPosix(relativePath), language: languageFor(entry.name), size: info.size });
    } catch {
    }
  }
}

function rankFiles(files, prompt) {
  return files
    .map((file, index) => ({ ...file, score: scoreFile(file, prompt), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function scoreFile(file, prompt) {
  const text = prompt.toLowerCase();
  const path = file.path.toLowerCase();
  const name = basename(path);
  const ext = extname(path);
  const frontendIntent = /\b(frontend|ui|screen|page|component|react|vue|svelte|html|colou?r|palette|theme|style|css|branding|design system|visual)\b/.test(text);
  const laravelHttpError = isLaravelHttpErrorPrompt(text);
  let score = 0;

  if (isRootConfig(path)) score += 18;
  if (/\b(colou?r|palette|theme|style|css|branding|design system|visual)\b/.test(text)) score += styleScore(path, ext);
  if (frontendIntent) score += frontendScore(path, ext);
  if (/\b(api|route|controller|backend|server|database|model|auth)\b/.test(text)) score += backendScore(path, ext);
  if (laravelHttpError) score += laravelHttpErrorScore(path);
  if (/\b(test|spec|bug|failing|error)\b/.test(text)) score += testScore(path);

  for (const token of promptTokens(text)) {
    if (name.includes(token)) score += 10;
    else if (path.includes(token)) score += 4;
  }

  if (path.includes("node_modules/") || path.includes("vendor/")) score -= 100;
  if (frontendIntent && isBackendOnlyPath(path) && !laravelHttpError) score -= 70;
  return score;
}

async function snippetFor(root, path, prompt) {
  try {
    const body = await readFile(resolve(root, path), "utf8");
    return excerpt(body, prompt);
  } catch {
    return "";
  }
}

function excerpt(body, prompt) {
  const lines = body.split(/\r\n|\r|\n/);
  const matcher = contextLineMatcher(prompt);
  const picked = lines
    .map((line, index) => ({ index: index + 1, line: line.trimEnd() }))
    .filter(({ line }) => matcher.test(line))
    .slice(0, 32);
  const source = picked.length > 0 ? picked : lines.slice(0, 36).map((line, index) => ({ index: index + 1, line }));
  return source.map(({ index, line }) => `${index}: ${line}`).join("\n").slice(0, 1400);
}

function contextLineMatcher(prompt) {
  if (/\b(colou?r|palette|theme|style|css|branding|design system|visual)\b/i.test(prompt)) {
    return /#(?:[0-9a-f]{3,8})\b|rgba?\(|hsla?\(|\b(color|background|border|shadow|theme|palette|primary|secondary|accent|surface|text|muted|brand)\b|var\(/i;
  }
  const tokens = promptTokens(prompt.toLowerCase()).slice(0, 10);
  return tokens.length > 0 ? new RegExp(tokens.map(escapeRegExp).join("|"), "i") : /\S/;
}

function styleScore(path, ext) {
  let score = [".css", ".scss", ".sass", ".less"].includes(ext) ? 55 : 0;
  if (/\b(tailwind|theme|themes|style|styles|color|colors|palette|token|tokens)\b/.test(path)) score += 45;
  if (/\b(app|global|globals|index|main)\.(css|scss|sass|less|tsx|ts|jsx|js)$/.test(path)) score += 22;
  score += frontendRootScore(path);
  return score;
}

function frontendScore(path, ext) {
  let score = [".tsx", ".jsx", ".vue", ".svelte", ".html", ".css"].includes(ext) ? 26 : 0;
  score += frontendRootScore(path);
  if (/\b(app|index|main|home|page|screen|component)\b/.test(path)) score += 12;
  return score;
}

function frontendRootScore(path) {
  return /^(src|app|pages|screens|components|styles|frontend|client|web)\//.test(path) ? 55
    : /^(resources\/(?:css|js|views)|public)\//.test(path) ? 34
    : /(^|\/)(components|screens|pages|views|layouts|styles)\//.test(path) ? 24 : 0;
}

function isBackendOnlyPath(path) { return /^(backend\/(?:app|routes|database|config|tests)|app\/http|routes\/|database\/|config\/)/.test(path); }

function backendScore(path, ext) {
  let score = [".php", ".py", ".rb", ".js", ".ts"].includes(ext) ? 16 : 0;
  if (/\b(routes|controllers|models|services|api|server|database|migrations)\b/.test(path)) score += 24;
  return score;
}

function testScore(path) {
  return /\b(test|tests|spec|__tests__)\b/.test(path) ? 36 : 0;
}

function isLaravelHttpErrorPrompt(text) {
  return /\b(?:laravel|inertia|csrf|xsrf|session|sanctum|419|page expired|login|auth|middleware|cookie|cookies)\b/.test(text)
    && /\b(?:http|preview|request|post|form|route|redirect|csrf|xsrf|session|419|login|page expired)\b/.test(text);
}

function laravelHttpErrorScore(path) {
  if (/^routes\/(?:web|api)\.php$/.test(path)) return 120;
  if (/^bootstrap\/app\.php$/.test(path)) return 95;
  if (/^app\/http\/middleware\//.test(path)) return 90;
  if (/^config\/(?:session|sanctum|cors|app|auth)\.php$/.test(path)) return 86;
  if (/^app\/http\/controllers\/auth\//.test(path)) return 82;
  if (/^app\/http\/requests\/auth\//.test(path)) return 78;
  if (/^resources\/js\/(?:app|bootstrap)\.[jt]sx?$/.test(path)) return 72;
  if (/^resources\/views\/.*\.(?:blade\.php|php)$/.test(path)) return 64;
  if (/(login|auth|csrf|xsrf|session|middleware|inertia|sanctum)/.test(path)) return 45;
  return 0;
}

function isRootConfig(path) {
  return /(^|\/)(package\.json|composer\.json|(?:vite|next|tailwind)\.config\.[cm]?[jt]s|tsconfig\.json|app\.json|angular\.json|pubspec\.yaml|pyproject\.toml|requirements\.txt)$/i.test(path);
}

function entryPriority(entry) {
  if (entry.isDirectory() && ["src", "app", "components", "pages", "screens", "styles", "resources", "routes"].includes(entry.name.toLowerCase())) return 0;
  if (isRootConfig(entry.name.toLowerCase())) return 1;
  return entry.isDirectory() ? 2 : 3;
}

function promptTokens(text) {
  return Array.from(new Set(text.split(/[^a-z0-9_.-]+/i).filter((token) => token.length >= 3 && !STOP_WORDS.has(token))));
}

const STOP_WORDS = new Set(["about", "after", "again", "all", "and", "are", "can", "does", "file", "find", "for", "from", "have", "how", "into", "like", "need", "show", "that", "the", "this", "what", "when", "where", "which", "with", "you"]);

function isTextFile(name) {
  return TEXT_NAMES.has(name) || TEXT_EXTS.has(extname(name).toLowerCase());
}

function isIgnoredDirectory(path) {
  const normalized = toPosix(path);
  return Array.from(SKIP_DIRS).some((ignored) => normalized === ignored || normalized.startsWith(`${ignored}/`));
}

function sensitiveContextPath(path) {
  return /(^|\/)(?:\.env(?:\.|$)|credentials?|secrets?|private[-_]?keys?)(?:\/|$)|\.(?:pem|key|p12|pfx|crt|cer)$/i.test(path);
}

function languageFor(filePath) {
  const ext = extname(filePath).toLowerCase().replace(/^\./, "");
  return !ext ? basename(filePath).toLowerCase() : ext === "md" ? "markdown" : ext === "yml" ? "yaml" : ext;
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function toPosix(path) { return String(path).replace(/\\/g, "/"); }
