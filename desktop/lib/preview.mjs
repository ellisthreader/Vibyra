import { dirname, extname, relative, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { headers } from "./http.mjs";
import { discoverProjects, findProjectById } from "./projects.mjs";
import { runningProjectDevServerUrl } from "./previewDevServer.mjs";
import { STATIC_PREVIEW_ENTRIES, isSourceOnlyPreviewHtml } from "./previewResolver.mjs";
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
    sendHtml(res, 404, previewShell("No runnable preview found", "Vibyra could not find a built browser entry or verified running dev server for this folder."));
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

export async function servePreviewServerProxy(res, url) {
  const match = url.pathname.match(/^\/preview\/server\/([^/]+)\/([^/]+)\/?(.*)$/);
  if (!match || decodeURIComponent(match[2]) !== TOKEN) {
    sendHtml(res, 401, previewShell("Preview link expired", "Reconnect your phone to Vibyra Desktop and open the project again."));
    return;
  }

  const projectId = decodeURIComponent(match[1]);
  const tracked = appState.previewServers[projectId];
  const targetBase = normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
  if (!targetBase) {
    sendHtml(res, 404, previewShell("Preview server not running", "Start the desktop preview server again from Vibyra."));
    return;
  }

  const requestedPath = decodeURIComponent(match[3] ?? "").replace(/^\/+/, "");
  const target = new URL(requestedPath, `${targetBase.toString().replace(/\/+$/, "")}/`);
  target.search = url.search;
  await proxyPreviewResponse(res, target, {
    proxyBase: previewServerProxyUrl(projectId, TOKEN),
    token: TOKEN
  });
}

export async function servePreviewUrlProxy(res, url) {
  const match = url.pathname.match(/^\/preview\/proxy-url\/([^/]+)\/?$/);
  if (!match || decodeURIComponent(match[1]) !== TOKEN) {
    sendHtml(res, 401, previewShell("Preview link expired", "Reconnect your phone to Vibyra Desktop and open the project again."));
    return;
  }

  const target = normalizeProxyTargetUrl(safeUrl(url.searchParams.get("url")));
  if (!target) {
    sendHtml(res, 400, previewShell("Preview asset unavailable", "Vibyra could not resolve that preview asset."));
    return;
  }

  await proxyPreviewResponse(res, target, {
    externalProxy: true,
    proxyBase: previewExternalUrl(target, TOKEN),
    token: TOKEN
  });
}

export async function servePreviewRefererAsset(res, url, referer) {
  const previewRef = previewReferenceFromReferer(referer, url);
  if (!previewRef || !canProxyPreviewFallbackPath(url.pathname)) return false;

  const requestedPath = `${url.pathname}${url.search}`;

  if (previewRef.kind === "project") {
    const synthetic = new URL(
      `/preview/project/${encodeURIComponent(previewRef.projectId)}/${encodeURIComponent(TOKEN)}${requestedPath}`,
      url
    );
    await serveProjectPreview(res, synthetic);
    return true;
  }

  const target = previewRef.kind === "external"
    ? new URL(requestedPath, previewRef.target)
    : previewTargetFromProject(previewRef.projectId, requestedPath);
  if (!target) return false;

  await proxyPreviewResponse(res, target, {
    externalProxy: previewRef.kind === "external",
    proxyBase: previewRef.kind === "external" ? previewExternalUrl(target, TOKEN) : previewServerProxyUrl(previewRef.projectId, TOKEN),
    token: TOKEN
  });
  return true;
}

export function previewUrl(projectId, token) {
  return `/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

export function previewServerProxyUrl(projectId, token) {
  return `/preview/server/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

export async function resolvedPreviewUrl(project, requestHost, token = TOKEN) {
  if (!project) return null;
  if (await previewEntryPath(project)) return previewUrl(project.id, token);
  return await runningProjectDevServerUrl(project, requestHost) ?? null;
}

async function previewEntryPath(project) {
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

async function readProjectText(projectPath, relativePath) {
  const filePath = await safeProjectFile(projectPath, relativePath);
  if (!filePath) return "";
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
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

async function proxyPreviewResponse(res, target, { externalProxy = false, proxyBase, token }) {
  try {
    const upstream = await fetch(target);
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const status = upstream.status;
    const isText = /^text\/|javascript|json|xml|svg/i.test(contentType);
    if (!isText) {
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(status, headers(contentType));
      res.end(body);
      return;
    }

    let body = await upstream.text();
    if (/text\/html/i.test(contentType)) {
      body = rewriteProxyHtml(body, { externalProxy, proxyBase, target, token });
    } else if (/text\/css/i.test(contentType)) {
      body = rewriteProxyCss(body, { externalProxy, proxyBase, target, token });
    } else if (/javascript/i.test(contentType)) {
      body = rewriteProxyJavaScript(body, { externalProxy, proxyBase, target, token });
    }
    res.writeHead(status, headers(contentType));
    res.end(body);
  } catch {
    sendHtml(res, 502, previewShell("Preview server unavailable", "The desktop preview server stopped responding. Start the preview again from Vibyra."));
  }
}

function rewriteProxyHtml(html, { externalProxy, proxyBase, target, token }) {
  const rewriteOptions = { externalProxy, proxyBase, target, token };
  return html
    .replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (_match, open, script, close) => {
      if (!shouldRewriteInlineScript(open)) return `${open}${script}${close}`;
      return `${open}${rewriteProxyJavaScript(script, rewriteOptions)}${close}`;
    })
    .replace(/\b(src|href)=["']([^"']+)["']/gi, (_match, attr, value) => {
      return `${attr}="${rewriteProxyReference(value, rewriteOptions)}"`;
    })
    .replace(/\bstyle=(["'])(.*?)\1/gi, (_match, quote, value) => {
      return `style=${quote}${rewriteProxyStyleUrls(value, rewriteOptions)}${quote}`;
    });
}

function shouldRewriteInlineScript(openTag) {
  const tag = String(openTag || "");
  if (/\btype=(["'])(?:application\/json|importmap)\1/i.test(tag)) return false;
  return true;
}

function rewriteProxyCss(css, { externalProxy, proxyBase, target, token }) {
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
      return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token })}${quote})`;
    })
    .replace(/@import\s+(["'])([^"']+)\1/gi, (_match, quote, value) => {
      return `@import ${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token })}${quote}`;
    });
}

function rewriteProxyStyleUrls(style, { externalProxy, proxyBase, target, token }) {
  return String(style).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
    return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token })}${quote})`;
  });
}

function rewriteProxyJavaScript(js, { externalProxy, proxyBase, target, token }) {
  const rewritten = js
    .replace(/(["'`])((?:https?:\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)[^"'`]+)\1/gi, (_match, quote, value) => {
      return `${quote}${previewExternalUrl(safeUrl(value), token)}${quote}`;
    })
    .replace(/\b((?:import|export)\s+(?:[^"'`]*?\s+from\s*)?)(["'`])((?:\/(?!\/))[^"'`]+)\2/g, (_match, prefix, quote, value) => {
      return `${prefix}${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token })}${quote}`;
    })
    .replace(/\b(import\s*\(\s*)(["'`])((?:\/(?!\/))[^"'`]+)\2/g, (_match, prefix, quote, value) => {
      return `${prefix}${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token })}${quote}`;
    })
    .replace(/(["'`])(\/(?!\/)[^"'`]+?\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)(?:[?#][^"'`]*)?)\1/gi, (_match, quote, value) => {
      return `${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token })}${quote}`;
    })
    .replace(/url\(\s*(["']?)(\/(?!\/)[^"')]+?\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)(?:[?#][^"')]*)?)\1\s*\)/gi, (_match, quote, value) => {
      return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token })}${quote})`;
    });
  return rewriteViteClientHmrForPreview(rewritten, { target });
}

function rewriteViteClientHmrForPreview(js, { target }) {
  if (target?.pathname !== "/@vite/client") return js;
  return js.replace(
    /transport\.connect\(createHMRHandler\(handleMessage\)\);\s*setupForwardConsoleHandler\(transport, forwardConsole\);/,
    [
      'if (!import.meta.url.includes("/preview/proxy-url/")) {',
      'transport.connect(createHMRHandler(handleMessage));',
      'setupForwardConsoleHandler(transport, forwardConsole);',
      '}'
    ].join("\n")
  );
}

function previewReferenceFromReferer(referer, requestUrl) {
  const raw = String(referer || "").trim();
  if (!raw) return null;

  let refUrl;
  try {
    refUrl = new URL(raw, requestUrl);
  } catch {
    return null;
  }

  let match = refUrl.pathname.match(/^\/preview\/server\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (match && decodeURIComponent(match[2]) === TOKEN) {
    return { kind: "server", projectId: decodeURIComponent(match[1]) };
  }

  match = refUrl.pathname.match(/^\/preview\/project\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (match && decodeURIComponent(match[2]) === TOKEN) {
    return { kind: "project", projectId: decodeURIComponent(match[1]) };
  }

  match = refUrl.pathname.match(/^\/preview\/proxy-url\/([^/]+)(?:\/|$)/);
  if (match && decodeURIComponent(match[1]) === TOKEN) {
    const target = normalizeProxyTargetUrl(safeUrl(refUrl.searchParams.get("url")));
    return target ? { kind: "external", target } : null;
  }

  return null;
}

function canProxyPreviewFallbackPath(pathname) {
  const path = String(pathname || "/");
  return !path.startsWith("/preview/")
    && !path.startsWith("/desktop/")
    && !path.startsWith("/app-assets/")
    && path !== "/desktop"
    && path !== "/health"
    && path !== "/pair"
    && path !== "/pair/status";
}

function previewTargetFromProject(projectId, requestedPath) {
  const tracked = appState.previewServers[projectId];
  const targetBase = normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
  if (!targetBase) return null;
  return new URL(String(requestedPath || "/"), `${targetBase.toString().replace(/\/+$/, "")}/`);
}

function rewriteProxyReference(value, { externalProxy = false, proxyBase, target, token }) {
  const raw = String(value).trim();
  if (!raw || /^(?:data:|blob:|mailto:|tel:|#)/i.test(raw)) return raw;
  if (raw.startsWith("/preview/")) return raw;
  if (/^https?:\/\//i.test(raw)) {
    const parsed = safeUrl(raw);
    return parsed && isLocalPreviewHost(parsed.hostname) ? previewExternalUrl(parsed, token) : raw;
  }
  if (raw.startsWith("//")) {
    const parsed = safeUrl(`${target.protocol}${raw}`);
    return parsed && isLocalPreviewHost(parsed.hostname) ? previewExternalUrl(parsed, token) : raw;
  }
  if (externalProxy) {
    try {
      return previewExternalUrl(new URL(raw, target), token);
    } catch {
      return raw;
    }
  }
  if (raw.startsWith("/")) return `${proxyBase}${raw.replace(/^\/+/, "")}`;
  try {
    const resolved = new URL(raw, target);
    return `${proxyBase}${resolved.pathname.replace(/^\/+/, "")}${resolved.search}${resolved.hash}`;
  } catch {
    return raw;
  }
}

function previewExternalUrl(target, token) {
  const normalized = normalizeProxyTargetUrl(target);
  if (!normalized) return "";
  return `/preview/proxy-url/${encodeURIComponent(token)}/?url=${encodeURIComponent(normalized.toString())}`;
}

function safeUrl(value) {
  try {
    return new URL(String(value ?? ""));
  } catch {
    return null;
  }
}

function isLocalPreviewHost(hostname) {
  const host = String(hostname ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost"
    || host === "0.0.0.0"
    || host === "127.0.0.1"
    || host === "::1"
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(?:1[6-9]|2\d|3[0-1])\./.test(host);
}

function normalizeProxyTargetUrl(target) {
  if (!target) return null;
  const next = new URL(target.toString());
  if (isLocalPreviewHost(next.hostname)) next.hostname = "127.0.0.1";
  return next;
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
