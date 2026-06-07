import { dirname, extname, posix } from "node:path";

const referencedExtensions = new Set([
  ".avif", ".bmp", ".css", ".gif", ".glb", ".gltf", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json",
  ".m4v", ".mjs", ".mov", ".mp3", ".mp4", ".ogg", ".otf", ".png", ".svg", ".ttf", ".wasm", ".webm",
  ".webmanifest", ".webp", ".woff", ".woff2"
]);

export function referencesFromFile(path, body, mountDirectory) {
  const ext = extname(path).toLowerCase();
  if (ext === ".html") return htmlReferences(path, body, mountDirectory);
  if (ext === ".css") return cssReferences(path, body, mountDirectory);
  if ([".js", ".mjs", ".cjs"].includes(ext)) return jsReferences(path, body, mountDirectory);
  return [];
}

function htmlReferences(path, html, mountDirectory) {
  const refs = [];
  collectMatches(html, /\b(?:src|href|poster|data)=["']([^"']+)["']/gi, refs);
  collectMatches(html, /\bsrcset=["']([^"']+)["']/gi, refs, (value) => (
    value.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean)
  ));
  collectMatches(html, /\bstyle=(["'])(.*?)\1/gi, refs, (_value, match) => cssReferences(path, match[2], mountDirectory));
  collectMatches(html, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, refs, (value) => cssReferences(path, value, mountDirectory));
  return normalizeReferences(refs.flat(), path, mountDirectory);
}

function cssReferences(path, css, mountDirectory) {
  const refs = [];
  collectMatches(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, refs, (_value, match) => match[2]);
  collectMatches(css, /@import\s+(?:url\(\s*)?(["'])([^"']+)\1/gi, refs, (_value, match) => match[2]);
  return normalizeReferences(refs, path, mountDirectory);
}

function jsReferences(path, js, mountDirectory) {
  const refs = [];
  collectMatches(js, /\b(?:import|export)\s+(?:[^"'()]+\s+from\s+)?["']([^"']+)["']/gi, refs);
  collectMatches(js, /\bimport\(\s*["']([^"']+)["']\s*\)/gi, refs);
  collectMatches(js, /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/gi, refs);
  collectMatches(js, /["']((?:\/|\.\.?\/)[^"']+\.[a-z0-9]{2,12}(?:[?#][^"']*)?)["']/gi, refs);
  return normalizeReferences(refs, path, mountDirectory);
}

function collectMatches(input, regex, refs, map = (value) => value) {
  for (const match of String(input).matchAll(regex)) refs.push(map(match[1], match));
}

function normalizeReferences(refs, fromPath, mountDirectory) {
  const seen = new Set();
  return refs
    .map((ref) => normalizeReference(ref, fromPath, mountDirectory))
    .filter((ref) => {
      if (!ref || seen.has(ref)) return false;
      seen.add(ref);
      return true;
    });
}

function normalizeReference(value, fromPath, mountDirectory) {
  const raw = String(value ?? "").trim();
  if (!raw || /^(?:https?:|\/\/|data:|blob:|mailto:|tel:|javascript:|#)/i.test(raw)) return "";
  const clean = decodePath(raw.split("#")[0].split("?")[0]);
  const unsupportedExtension = !referencedExtensions.has(extname(clean).toLowerCase());
  if (unsupportedExtension) {
    if (isGeneratedBuildSourceReference(clean)) return "";
    if (!looksPrivateReference(clean)) return "";
  }
  const base = clean.startsWith("/") ? mountDirectory : dirname(fromPath);
  const normalized = posix.normalize(posix.join(base || "", clean.replace(/^\/+/, "")));
  if (unsupportedExtension && isGeneratedBuildSourceReference(normalized)) return "";
  return normalized.startsWith("../") || normalized === ".." ? "" : normalized;
}

function isGeneratedBuildSourceReference(path) {
  return /^(?:\/)?build\/assets\//i.test(path);
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksPrivateReference(path) {
  return /^\.env(?:\.|$)/i.test(posix.basename(path))
    || /(?:^|[-_.])(secret|token|credential|password|private[-_.]?key|api[-_.]?key)(?:[-_.]|$)/i.test(posix.basename(path));
}
