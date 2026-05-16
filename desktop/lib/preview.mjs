import { dirname, extname, relative, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { headers } from "./http.mjs";
import { discoverProjects, findProjectById } from "./projects.mjs";
import { runningProjectDevServerUrl } from "./previewDevServer.mjs";
import { STATIC_PREVIEW_ENTRIES, analyzedProjectPreviewHtml, isSourceOnlyPreviewHtml } from "./previewResolver.mjs";
import { appState, TOKEN } from "./state.mjs";

export async function serveProjectPreview(res, url) {
  const match = url.pathname.match(/^\/preview\/project\/([^/]+)\/([^/]+)\/?(.*)$/);
  if (!match || decodeURIComponent(match[2]) !== TOKEN) {
    sendHtml(res, 401, previewShell("Preview link expired", "Reconnect your phone to Vibyra Desktop and open the project again."));
    return;
  }

  if (appState.cachedProjects.length === 0) {
    await discoverProjects();
  }

  const projectId = decodeURIComponent(match[1]);
  const project = findProjectById(projectId);
  if (!project) {
    sendHtml(res, 404, previewShell("Project not found", "Vibyra Desktop could not find that workspace anymore."));
    return;
  }

  const requestedPath = decodeURIComponent(match[3] ?? "").replace(/^\/+/, "");
  const entryPath = await previewEntryPath(project);
  const relativePath = requestedPath || entryPath;

  if (!relativePath) {
    const devServerUrl = await runningProjectDevServerUrl(project, url.host);
    if (devServerUrl) {
      redirect(res, devServerUrl);
      return;
    }
    sendHtml(res, 200, analyzedProjectPreviewHtml(project));
    return;
  }

  const filePath = await safeProjectFile(project.path, relativePath);
  if (!filePath) {
    if (isPreviewImagePath(relativePath)) {
      res.writeHead(200, headers("image/svg+xml; charset=utf-8"));
      res.end(missingPreviewImageSvg());
      return;
    }

    sendHtml(res, 404, previewShell("Preview file missing", "The requested preview asset is no longer available."));
    return;
  }

  const contentType = contentTypeFor(filePath);
  let content = await readFile(filePath);
  const mountDirectory = previewMountDirectory(entryPath);

  if (contentType.startsWith("text/html")) {
    const documentDirectory = requestedPath ? dirname(relativePath) : mountDirectory;
    content = Buffer.from(rewritePreviewHtml(content.toString("utf8"), {
      documentDirectory: documentDirectory === "." ? "" : documentDirectory,
      mountDirectory,
      projectId,
      token: TOKEN
    }));
  } else if (contentType.startsWith("text/css")) {
    content = Buffer.from(rewritePreviewCss(content.toString("utf8"), { mountDirectory, projectId, token: TOKEN }));
  }

  res.writeHead(200, headers(contentType));
  res.end(content);
}

export function previewUrl(projectId, token) {
  return `/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

export async function resolvedPreviewUrl(project, requestHost, token = TOKEN) {
  if (!project) return null;
  if (await previewEntryPath(project)) return previewUrl(project.id, token);
  return await runningProjectDevServerUrl(project, requestHost) ?? previewUrl(project.id, token);
}

async function previewEntryPath(project) {
  for (const candidate of STATIC_PREVIEW_ENTRIES) {
    const filePath = await safeProjectFile(project.path, candidate);
    if (!filePath) continue;
    const html = await readFile(filePath, "utf8");
    if (!isSourceOnlyPreviewHtml(html, candidate)) return candidate;
  }

  return "";
}

async function safeProjectFile(projectPath, relativePath) {
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

function previewMountDirectory(entryPath) {
  const directory = entryPath ? dirname(entryPath) : "";
  return directory === "." ? "" : directory;
}

function rewritePreviewHtml(html, { documentDirectory, mountDirectory, projectId, token }) {
  const rootBase = previewUrl(projectId, token);
  const normalizedDocumentDirectory = documentDirectory ? documentDirectory.replace(/^\/+|\/+$/g, "") : "";
  const documentBase = `${rootBase}${normalizedDocumentDirectory ? `${normalizedDocumentDirectory}/` : ""}`;
  const mountBase = previewBase(rootBase, mountDirectory);

  return html.replace(/\b(src|href)=["'](?!https?:|\/\/|data:|mailto:|tel:|#)([^"']+)["']/gi, (_match, attr, value) => {
    const cleaned = String(value).replace(/^\.?\//, "");
    const base = String(value).startsWith("/") ? mountBase : documentBase;
    return `${attr}="${base}${cleaned}"`;
  });
}

function rewritePreviewCss(css, { mountDirectory, projectId, token }) {
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

function previewBase(rootBase, directory) {
  const normalized = directory ? directory.replace(/^\/+|\/+$/g, "") : "";
  return `${rootBase}${normalized ? `${normalized}/` : ""}`;
}

function contentTypeFor(filePath) {
  const types = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".jsx": "application/javascript; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".ts": "application/javascript; charset=utf-8",
    ".tsx": "application/javascript; charset=utf-8",
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json; charset=utf-8"
  };

  return types[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function isPreviewImagePath(path) {
  const cleanPath = String(path).split("?")[0];
  return [".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extname(cleanPath).toLowerCase());
}

function missingPreviewImageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#21163a"/><stop offset="1" stop-color="#0b0d17"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><path d="M120 404 302 242l118 102 78-70 342 130v46H120z" fill="#8e3cff" opacity=".42"/><circle cx="690" cy="170" r="58" fill="#d7c4ff" opacity=".72"/><text x="480" y="478" fill="#efe8ff" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle">Image asset not included</text></svg>`;
}

function sendHtml(res, status, html) {
  res.writeHead(status, headers("text/html; charset=utf-8"));
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { ...headers("text/plain; charset=utf-8"), Location: location });
  res.end(`Redirecting to ${location}`);
}

function previewShell(title, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; --bg: #07080f; --panel: #10121c; --line: #2c2442; --text: #f7f3ff; --muted: #b8b1ca; --accent: #7c3cff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(560px, 100%); border: 1px solid var(--line); border-radius: 18px; background: var(--panel); padding: 26px; }
      h1 { margin: 0 0 10px; font-size: clamp(28px, 8vw, 48px); line-height: 1; }
      p { margin: 0; color: var(--muted); font-size: 16px; font-weight: 700; line-height: 1.55; }
    </style>
  </head>
  <body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
