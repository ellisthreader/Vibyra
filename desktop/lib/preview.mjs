import { dirname, extname, relative, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { headers } from "./http.mjs";
import { discoverProjects, findProjectById } from "./projects.mjs";
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
    sendHtml(res, 200, previewShell(project.name, "This project does not have a phone-viewable app entry yet."));
    return;
  }

  const filePath = await safeProjectFile(project.path, relativePath);
  if (!filePath) {
    sendHtml(res, 404, previewShell("Preview file missing", "The requested preview asset is no longer available."));
    return;
  }

  const contentType = contentTypeFor(filePath);
  let content = await readFile(filePath);

  if (contentType.startsWith("text/html")) {
    const entryDirectory = requestedPath ? dirname(relativePath) : dirname(entryPath);
    content = Buffer.from(rewritePreviewHtml(content.toString("utf8"), {
      entryDirectory: entryDirectory === "." ? "" : entryDirectory,
      projectId,
      token: TOKEN
    }));
  }

  res.writeHead(200, headers(contentType));
  res.end(content);
}

export function previewUrl(projectId, token) {
  return `/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

async function previewEntryPath(project) {
  const candidates = ["index.html", "dist/index.html", "build/index.html", "public/index.html", "web/index.html"];

  for (const candidate of candidates) {
    if (await safeProjectFile(project.path, candidate)) return candidate;
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

function rewritePreviewHtml(html, { entryDirectory, projectId, token }) {
  const rootBase = previewUrl(projectId, token);
  const entryBase = `${rootBase}${entryDirectory ? `${entryDirectory.replace(/^\/+|\/+$/g, "")}/` : ""}`;

  return html.replace(/\b(src|href)=["'](?!https?:|data:|mailto:|tel:|#)([^"']+)["']/gi, (_match, attr, value) => {
    const cleaned = String(value).replace(/^\.?\//, "");
    const base = String(value).startsWith("/") ? rootBase : entryBase;
    return `${attr}="${base}${cleaned}"`;
  });
}

function contentTypeFor(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  };

  return types[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function sendHtml(res, status, html) {
  res.writeHead(status, headers("text/html; charset=utf-8"));
  res.end(html);
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
