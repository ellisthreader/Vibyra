import { dirname, extname, relative, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { STATIC_PREVIEW_ENTRIES, isSourceOnlyPreviewHtml } from "./previewResolver.mjs";
import { previewUrl } from "./previewUrls.mjs";


export async function previewEntryPath(project) {
  const skipStaticEntries = await shouldSkipStaticPreviewEntries(project.path);
  for (const candidate of STATIC_PREVIEW_ENTRIES) {
    if (skipStaticEntries) continue;
    const filePath = await safeProjectFile(project.path, candidate);
    if (!filePath) continue;
    const html = await readFile(filePath, "utf8");
    if (!isSourceOnlyPreviewHtml(html, candidate)) return candidate;
  }

  return "";
}

async function shouldSkipStaticPreviewEntries(projectPath) {
  const composer = await readProjectText(projectPath, "composer.json");
  const packageText = await readProjectText(projectPath, "package.json");
  return /laravel\\?\/framework/i.test(composer) && /laravel-vite-plugin/i.test(packageText);
}

export async function readProjectText(projectPath, relativePath) {
  const filePath = await safeProjectFile(projectPath, relativePath);
  if (!filePath) return "";
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function safeProjectFile(projectPath, relativePath) {
  const root = resolve(projectPath);
  const filePath = resolve(root, relativePath);
  const pathFromRoot = relative(root, filePath);

  if (pathFromRoot.startsWith("..") || pathFromRoot === "" || pathFromRoot.startsWith("../")) {
    return null;
  }

  try {
    return (await stat(filePath)).isFile() ? filePath : null;
  } catch {
    return null;
  }
}

export function previewMountDirectory(entryPath) {
  const directory = entryPath ? dirname(entryPath) : "";
  return directory === "." ? "" : directory;
}

export function rewritePreviewHtml(html, { documentDirectory, mountDirectory, projectId, token }) {
  const rootBase = previewUrl(projectId, token);
  const normalizedDocumentDirectory = documentDirectory ? documentDirectory.replace(/^\/+|\/+$/g, "") : "";
  const documentBase = `${rootBase}${normalizedDocumentDirectory ? `${normalizedDocumentDirectory}/` : ""}`;
  const mountBase = previewBase(rootBase, mountDirectory);

  return html
    .replace(/\b(src|href)=["'](?!https?:|\/\/|data:|mailto:|tel:|#)([^"']+)["']/gi, (_match, attr, value) => {
      return `${attr}="${rewritePreviewHtmlReference(value, { documentBase, mountBase })}"`;
    })
    .replace(/\bstyle=(["'])(.*?)\1/gi, (_match, quote, value) => {
      return `style=${quote}${rewritePreviewInlineStyle(value, { documentBase, mountBase })}${quote}`;
    });
}

function rewritePreviewHtmlReference(value, { documentBase, mountBase }) {
  const raw = String(value).trim();
  if (!raw || /^(?:https?:|\/\/|data:|mailto:|tel:|#)/i.test(raw)) return raw;
  const cleaned = raw.replace(/^\.?\//, "");
  const base = raw.startsWith("/") ? mountBase : documentBase;
  return `${base}${cleaned}`;
}

function rewritePreviewInlineStyle(style, { documentBase, mountBase }) {
  return String(style).replace(/url\(\s*(["']?)(?!https?:|\/\/|data:|mailto:|tel:|#)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
    return `url(${quote}${rewritePreviewHtmlReference(value, { documentBase, mountBase })}${quote})`;
  });
}

export function rewritePreviewCss(css, { mountDirectory, projectId, token }) {
  const mountBase = previewBase(previewUrl(projectId, token), mountDirectory);
  return css
    .replace(/url\(\s*(["']?)(?!https?:|\/\/|data:|mailto:|tel:|#)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
      const raw = String(value).trim();
      if (!raw.startsWith("/")) return `url(${quote}${raw}${quote})`;
      return `url(${quote}${mountBase}${raw.replace(/^\/+/, "")}${quote})`;
    })
    .replace(/@import\s+(["'])(?!https?:|\/\/|data:|#)([^"']+)\1/gi, (_match, quote, value) => {
      const raw = String(value).trim();
      if (!raw.startsWith("/")) return `@import ${quote}${raw}${quote}`;
      return `@import ${quote}${mountBase}${raw.replace(/^\/+/, "")}${quote}`;
    });
}

export function previewBase(rootBase, directory) {
  const normalized = directory ? directory.replace(/^\/+|\/+$/g, "") : "";
  return `${rootBase}${normalized ? `${normalized}/` : ""}`;
}

export function contentTypeFor(filePath) {
  const types = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".jsx": "application/javascript; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".m4v": "video/x-m4v",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".otf": "font/otf",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".ttf": "font/ttf",
    ".ts": "application/javascript; charset=utf-8",
    ".tsx": "application/javascript; charset=utf-8",
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json; charset=utf-8"
  };

  return types[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function isPreviewImagePath(path) {
  const cleanPath = String(path).split("?")[0];
  return [".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extname(cleanPath).toLowerCase());
}

export function missingPreviewImageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#21163a"/><stop offset="1" stop-color="#0b0d17"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><path d="M120 404 302 242l118 102 78-70 342 130v46H120z" fill="#8e3cff" opacity=".42"/><circle cx="690" cy="170" r="58" fill="#d7c4ff" opacity=".72"/><text x="480" y="478" fill="#efe8ff" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle">Image asset not included</text></svg>`;
}
