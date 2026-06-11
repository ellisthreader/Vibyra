import { extname, relative, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolveDesktopProject } from "./projects.mjs";

const SOURCE_EXTENSIONS = new Set([".astro", ".css", ".html", ".js", ".jsx", ".php", ".svelte", ".ts", ".tsx", ".vue"]);
const SKIP_DIRECTORIES = new Set([".expo", ".git", ".next", ".output", ".vibyra-agent", "build", "coverage", "dist", "node_modules", "vendor"]);
const MAX_FILES = 700;
const MAX_BYTES = 500_000;

export async function resolvePreviewElement(body = {}) {
  const project = await resolveDesktopProject(body.projectId);
  if (!project) throw resolverError("That Preview project is no longer available.", 404);
  const element = normalizeElement(body.element);
  if (!element.tag) throw resolverError("Select an element inside the Preview first.", 422);

  const appDirectory = safeAppDirectory(body.appDirectory);
  const sourcePath = cleanSourcePath(element.source.file);
  const exactFile = await directSourceFile(project.path, appDirectory, sourcePath);
  if (exactFile) {
    const content = await readFile(exactFile.absolute, "utf8").catch(() => "");
    const match = scoreSourceFile(exactFile.path, content, element);
    if (sourceHintIsReliable(exactFile.path, content, element)) {
      return {
        ok: true,
        resolution: {
          confidence: "exact",
          match,
          candidates: [match],
          summary: resolutionSummary(element, "exact", match)
        }
      };
    }
  }
  const files = [];
  const scanRoot = appDirectory ? resolve(project.path, appDirectory) : project.path;
  await scanSourceFiles(scanRoot, "", files, 0, appDirectory);
  const searchFiles = files.length || !appDirectory
    ? files
    : await scanProjectFallback(project.path);
  const ranked = [];
  for (let index = 0; index < searchFiles.length; index += 32) {
    const batch = await Promise.all(searchFiles.slice(index, index + 32).map(async (file) => {
      const content = await readFile(file.absolute, "utf8").catch(() => "");
      return content ? scoreSourceFile(file.path, content, element) : null;
    }));
    ranked.push(...batch.filter((match) => match?.score > 0));
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const candidates = ranked.slice(0, 5);
  const top = candidates[0] || null;
  const exactSource = top && top.reasons.includes("framework source");
  const ambiguous = !top || (!exactSource && candidates[1] && top.score - candidates[1].score < 14);
  const confidence = !top ? "none"
    : exactSource ? "exact"
      : ambiguous ? "ambiguous"
        : top.score >= 90 ? "high"
          : top.score >= 55 ? "medium" : "low";
  return {
    ok: true,
    resolution: {
      confidence,
      match: ambiguous || !top ? null : top,
      candidates,
      summary: resolutionSummary(element, confidence, top)
    }
  };
}

async function scanSourceFiles(root, directory, files, depth, pathPrefix = "") {
  if (files.length >= MAX_FILES || depth > 9) return;
  let entries = [];
  try {
    entries = await readdir(resolve(root, directory), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => sourcePriority(a.name) - sourcePriority(b.name) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (files.length >= MAX_FILES) return;
    const localPath = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && !SKIP_DIRECTORIES.has(entry.name)) {
        await scanSourceFiles(root, localPath, files, depth + 1, pathPrefix);
      }
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    const absolute = resolve(root, localPath);
    const path = pathPrefix ? `${pathPrefix}/${localPath}` : localPath;
    try {
      if ((await stat(absolute)).size <= MAX_BYTES) files.push({ absolute, path: path.replace(/\\/g, "/") });
    } catch {}
  }
}

async function directSourceFile(projectRoot, appDirectory, sourcePath) {
  if (!sourcePath) return null;
  const projectAbsolute = resolve(projectRoot);
  const normalized = sourcePath.replace(/\\/g, "/");
  const projectRelative = safeProjectRelative(projectAbsolute, normalized);
  const withoutRoot = normalized.replace(/^\/+/, "");
  const candidates = [
    projectRelative,
    appDirectory && withoutRoot.startsWith(`${appDirectory}/`) ? withoutRoot : "",
    appDirectory ? `${appDirectory}/${withoutRoot}` : withoutRoot
  ].filter(Boolean);
  for (const path of [...new Set(candidates)]) {
    if (!SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) || path.split("/").some((part) => SKIP_DIRECTORIES.has(part))) continue;
    const absolute = resolve(projectAbsolute, path);
    if (!safeProjectRelative(projectAbsolute, absolute)) continue;
    try {
      const details = await stat(absolute);
      if (details.isFile() && details.size <= MAX_BYTES) return { absolute, path: path.replace(/\\/g, "/") };
    } catch {}
  }
  return null;
}

function safeProjectRelative(projectRoot, value) {
  const path = relative(projectRoot, resolve(value)).replace(/\\/g, "/");
  return path && path !== ".." && !path.startsWith("../") ? path : "";
}

async function scanProjectFallback(projectRoot) {
  const files = [];
  await scanSourceFiles(projectRoot, "", files, 0);
  return files;
}

function scoreSourceFile(path, content, element) {
  let score = 0;
  const reasons = [];
  let needle = "";
  const sourcePath = cleanSourcePath(element.source.file);
  const embeddedContainer = sourceIsEmbeddedContainer(path, content, element);
  const reliableSource = !embeddedContainer && sourceHintIsReliable(path, content, element);
  if (reliableSource && sourcePath && sourcePathMatches(path, sourcePath)) {
    score += 180;
    reasons.push("framework source");
  }
  if (reliableSource && element.source.component && componentAppears(content, element.source.component)) {
    score += 75;
    reasons.push(`component ${element.source.component}`);
    needle ||= element.source.component;
  }
  if (element.text.length >= 3 && visibleTextAppears(content, element.text)) {
    score += Math.min(90, 55 + Math.floor(element.text.length / 16));
    reasons.push("selected text");
    needle ||= element.text;
  }
  if (element.id && attributeAppears(content, "id", element.id)) {
    score += 60;
    reasons.push(`id ${element.id}`);
    needle ||= element.id;
  }
  if (element.testId && (attributeAppears(content, "data-testid", element.testId) || attributeAppears(content, "data-test-id", element.testId))) {
    score += 85;
    reasons.push(`test id ${element.testId}`);
    needle ||= element.testId;
  }
  if (element.ariaLabel && attributeAppears(content, "aria-label", element.ariaLabel)) {
    score += 55;
    reasons.push("aria label");
    needle ||= element.ariaLabel;
  }
  if (element.role && attributeAppears(content, "role", element.role)) {
    score += 25;
    reasons.push(`role ${element.role}`);
    needle ||= element.role;
  }
  for (const [attribute, value, weight] of [
    ["name", element.name, 45],
    ["placeholder", element.placeholder, 65],
    ["title", element.title, 45],
    ["alt", element.alt, 65],
    ["href", element.href, 45]
  ]) {
    if (value && attributeAppears(content, attribute, value)) {
      score += weight;
      reasons.push(`${attribute} ${value}`);
      needle ||= value;
    }
  }
  if (tagAppears(content, element.tag)) {
    score += 12;
    reasons.push(`tag ${element.tag}`);
  }
  const nearbySignals = elementEvidenceNearLine(content, element, lineFor(content, needle));
  if (nearbySignals >= 2) {
    score += Math.min(45, nearbySignals * 12);
    reasons.push("co-located element evidence");
  }
  const classHits = element.classes.filter((name) => name.length >= 3 && content.includes(name)).slice(0, 4);
  if (classHits.length) {
    score += classHits.length * 9;
    reasons.push(`classes ${classHits.join(", ")}`);
    needle ||= classHits[0];
  }
  if (reliableSource && element.source.component && path.toLowerCase().includes(element.source.component.toLowerCase())) score += 28;
  const line = reasons.includes("framework source") && element.source.line
    ? element.source.line
    : lineFor(content, needle);
  const column = reasons.includes("framework source") && element.source.column
    ? element.source.column
    : 1;
  return { path, line, column, score, reasons, snippet: snippetAt(content, line) };
}

function normalizeElement(value = {}) {
  const source = value.source && typeof value.source === "object" ? value.source : {};
  return {
    tag: bounded(value.tag, 40),
    id: bounded(value.id, 120),
    text: bounded(value.text, 500).replace(/\s+/g, " ").trim(),
    role: bounded(value.role, 80),
    testId: bounded(value.testId, 120),
    ariaLabel: bounded(value.ariaLabel, 240),
    name: bounded(value.name, 120),
    placeholder: bounded(value.placeholder, 240),
    title: bounded(value.title, 240),
    alt: bounded(value.alt, 240),
    href: bounded(value.href, 500),
    classes: Array.isArray(value.classes) ? value.classes.map((item) => bounded(item, 100)).filter(Boolean).slice(0, 8) : [],
    source: {
      framework: bounded(source.framework, 30),
      component: bounded(source.component, 120),
      file: bounded(source.file, 1000),
      line: Math.max(0, Number(source.line) || 0),
      column: Math.max(0, Number(source.column) || 0)
    }
  };
}

function cleanSourcePath(value) {
  let path = String(value || "").split(/[?#]/)[0].replace(/^webpack:\/+/, "/").replace(/^file:\/+/, "/");
  try { if (/^https?:\/\//i.test(path)) path = new URL(path).pathname; } catch {}
  return decodeURIComponent(path).replace(/^\/@fs\//, "/").replace(/\\/g, "/");
}
function sourcePathMatches(path, hint) {
  const normalized = hint.replace(/^\/+/, "");
  return path === normalized || hint.endsWith(`/${path}`) || path.endsWith(`/${normalized}`);
}
function componentAppears(content, name) {
  const escaped = escapeRegExp(name);
  return new RegExp(`(?:function|class|const|let|var)\\s+${escaped}\\b|<${escaped}\\b|name\\s*:\\s*["']${escaped}["']`).test(content);
}
function attributeAppears(content, name, value) {
  return new RegExp(`${escapeRegExp(name)}\\s*=\\s*["'{][^"'\\n}]*${escapeRegExp(value)}`, "i").test(content);
}
function visibleTextAppears(content, text) {
  const escaped = escapeRegExp(text.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`>\\s*${escaped}\\s*<|["'\`]${escaped}["'\`]`, "i").test(content);
}
function sourceIsEmbeddedContainer(path, content, element) {
  if (element.tag === "iframe") return false;
  const identity = `${path} ${element.source.component}`.toLowerCase();
  const namedContainer = /(webview|web-view|iframe|preview[-_ ]?frame|browser[-_ ]?(?:frame|view))/.test(identity);
  const rendersEmbeddedSurface = /<iframe\b|<WebView\b|react-native-webview|ReactNativeWebView/.test(content);
  return namedContainer && rendersEmbeddedSurface;
}
function sourceHintIsReliable(path, content, element) {
  if (sourceIsEmbeddedContainer(path, content, element)) return false;
  if (!element.source.line) return !isGenericSource(element.source.component, path);
  const nearby = sourceWindow(content, element.source.line);
  if (!tagAppears(nearby, element.tag)) return false;
  return !isGenericSource(element.source.component, path)
    || elementEvidenceNearLine(content, element, element.source.line) >= 2;
}
function isGenericSource(component, path) {
  const name = String(component || "").toLowerCase();
  const base = String(path || "").split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() || "";
  return /(?:^|[-_.])(app|root|layout|page|screen|index|main|shell)$/.test(name)
    || /(?:app|root|layout|page|screen|index|main|shell)$/.test(base);
}
function elementEvidenceNearLine(content, element, line) {
  if (!line) return 0;
  const nearby = sourceWindow(content, line);
  let signals = 0;
  if (tagAppears(nearby, element.tag)) signals += 1;
  if (element.text.length >= 3 && visibleTextAppears(nearby, element.text)) signals += 2;
  for (const [attribute, value] of [
    ["id", element.id],
    ["data-testid", element.testId],
    ["data-test-id", element.testId],
    ["aria-label", element.ariaLabel],
    ["role", element.role],
    ["name", element.name],
    ["placeholder", element.placeholder],
    ["title", element.title],
    ["alt", element.alt],
    ["href", element.href]
  ]) {
    if (value && attributeAppears(nearby, attribute, value)) signals += 2;
  }
  if (element.classes.some((name) => name.length >= 3 && nearby.includes(name))) signals += 1;
  return signals;
}
function sourceWindow(content, line) {
  const lines = content.split(/\r\n|\r|\n/);
  const start = Math.max(0, line - 8);
  return lines.slice(start, Math.min(lines.length, line + 7)).join("\n");
}
function tagAppears(content, tag) {
  return Boolean(tag && new RegExp(`<${escapeRegExp(tag)}(?:\\s|>)`, "i").test(content));
}
function lineFor(content, needle) {
  if (!needle) return 1;
  const index = content.indexOf(needle);
  return index < 0 ? 1 : content.slice(0, index).split(/\r\n|\r|\n/).length;
}
function snippetAt(content, line) {
  const lines = content.split(/\r\n|\r|\n/);
  const start = Math.max(0, line - 2);
  return lines.slice(start, start + 3).map((value, index) => `${start + index + 1}: ${value.trimEnd()}`).join("\n").slice(0, 700);
}
function sourcePriority(name) {
  return ["src", "app", "components", "pages", "screens", "resources", "views", "styles"].includes(name.toLowerCase()) ? 0 : 1;
}
function safeAppDirectory(value) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  return !path || path.startsWith("/") || path.split("/").includes("..") ? "" : path;
}
function resolutionSummary(element, confidence, top) {
  if (confidence === "none") return "No matching source file was found.";
  if (confidence === "ambiguous") return "Choose the source file that owns this element.";
  return `${element.source.component || element.tag} maps to ${top.path}:${top.line}.`;
}
function bounded(value, length) { return String(value || "").slice(0, length); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function resolverError(message, status) { const error = new Error(message); error.status = status; return error; }
