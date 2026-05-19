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
    if (trackedPreviewTarget(projectId)) {
      redirect(res, previewServerProxyUrl(projectId, TOKEN));
      return;
    }
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
    if (trackedPreviewTarget(projectId)) {
      await servePreviewServerProxy(res, new URL(previewServerProxyUrl(projectId, TOKEN) + requestedPath, url));
      return;
    }
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

export async function servePreviewServerProxy(reqOrRes, resOrUrl, maybeUrl) {
  const { req, res, url } = routeArgs(reqOrRes, resOrUrl, maybeUrl);
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
    token: TOKEN,
    req
  });
}

export async function servePreviewUrlProxy(reqOrRes, resOrUrl, maybeUrl) {
  const { req, res, url } = routeArgs(reqOrRes, resOrUrl, maybeUrl);
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

  const proxyTarget = laravelPublicAssetTargetForViteProxy(target) ?? target;
  await proxyPreviewResponse(res, proxyTarget, {
    externalProxy: true,
    proxyBase: previewExternalUrl(proxyTarget, TOKEN),
    token: TOKEN,
    req
  });
}

export async function servePreviewRefererAsset(reqOrRes, resOrUrl, urlOrReferer, maybeReferer) {
  const req = maybeReferer === undefined ? null : reqOrRes;
  const res = maybeReferer === undefined ? reqOrRes : resOrUrl;
  const url = maybeReferer === undefined ? resOrUrl : urlOrReferer;
  const referer = maybeReferer === undefined ? urlOrReferer : maybeReferer;
  const previewRef = previewReferenceFromReferer(referer, url) ?? activePreviewAssetReference(url.pathname);
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
    token: TOKEN,
    req
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

function routeArgs(reqOrRes, resOrUrl, maybeUrl) {
  if (maybeUrl) return { req: reqOrRes, res: resOrUrl, url: maybeUrl };
  return { req: null, res: reqOrRes, url: resOrUrl };
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

async function proxyPreviewResponse(res, target, { externalProxy = false, proxyBase, token, req = null }) {
  try {
    const requestInit = await proxyRequestInit(req, target, proxyBase);
    const upstream = await fetch(target, requestInit);
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const status = upstream.status;
    if (shouldConvertViteModuleError(target, status)) {
      const body = await upstream.text();
      const viteError = viteModuleErrorFromHtml(body, target);
      if (viteError) {
        res.writeHead(200, headers("application/javascript; charset=utf-8"));
        res.end(viteModuleErrorJavaScript(viteError));
        return;
      }
    }
    const isText = /^text\/|javascript|json|xml|svg/i.test(contentType);
    const proxyContext = previewProxyContext(target, token);
    const responseHeaders = proxyResponseHeaders(upstream, contentType, { externalProxy, proxyBase, target, token, proxyContext });
    if (!isText) {
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(status, responseHeaders);
      res.end(body);
      return;
    }

    let body = await upstream.text();
    if (/text\/html/i.test(contentType)) {
      body = rewriteProxyHtml(body, { externalProxy, proxyBase, target, token, proxyContext });
      if (status >= 400) body = injectProxyHttpErrorOverlay(body, { status, target });
    } else if (/text\/css/i.test(contentType)) {
      body = rewriteProxyCss(body, { externalProxy, proxyBase, target, token, proxyContext });
    } else if (/javascript/i.test(contentType)) {
      body = rewriteProxyJavaScript(body, { externalProxy, proxyBase, target, token, proxyContext });
    }
    res.writeHead(status, responseHeaders);
    res.end(body);
  } catch {
    sendHtml(res, 502, previewShell("Preview server unavailable", "The desktop preview server stopped responding. Start the preview again from Vibyra."));
  }
}

function shouldConvertViteModuleError(target, status) {
  return status >= 500 && status <= 599 && isDevSourceModulePath(target?.pathname);
}

function isDevSourceModulePath(pathname) {
  return /^\/(?:@fs\/|src\/|resources\/|app\/|pages\/|components\/)/i.test(String(pathname || ""))
    && /\.(?:jsx?|tsx?|mjs|vue|svelte)(?:[?#]|$)/i.test(String(pathname || ""));
}

function viteModuleErrorFromHtml(body, target) {
  const html = String(body || "");
  if (!/<html[\s>]/i.test(html) || !/ErrorOverlay|vite:/i.test(html)) return null;
  const error = parseViteErrorObject(html);
  const message = String(error?.message || `Vite failed to load ${target.pathname}`);
  return {
    file: String(error?.id || error?.loc?.file || target.pathname),
    frame: String(error?.frame || ""),
    message,
    plugin: String(error?.plugin || ""),
    stack: String(error?.stack || "")
  };
}

function parseViteErrorObject(html) {
  const marker = "const error = ";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf("\n              try", start);
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(start + marker.length, end).trim());
  } catch {
    return null;
  }
}

function viteModuleErrorJavaScript(error) {
  const message = error.plugin ? `${error.plugin}: ${error.message}` : error.message;
  const detail = [message, error.file, error.frame, error.stack].filter(Boolean).join("\n\n");
  return [
    "const error = ".concat(JSON.stringify({ ...error, message }), ";"),
    "const detail = ".concat(JSON.stringify(detail), ";"),
    "function send(payload) {",
    "  try {",
    "    const next = Object.assign({ source: 'vibyra-preview-error' }, payload);",
    "    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(next));",
    "    else if (window.parent) window.parent.postMessage(next, '*');",
    "  } catch (_) {}",
    "}",
    "function render() {",
    "  const root = document.body || document.documentElement;",
    "  if (!root || document.getElementById('vibyra-vite-module-error')) return;",
    "  const wrap = document.createElement('main');",
    "  wrap.id = 'vibyra-vite-module-error';",
    "  wrap.style.cssText = 'box-sizing:border-box;min-height:100vh;margin:0;padding:24px;background:#0b0d17;color:#f7f3ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;display:flex;align-items:center;justify-content:center;';",
    "  wrap.innerHTML = ".concat(JSON.stringify(viteErrorOverlayHtml(message, detail)), ";"),
    "  root.appendChild(wrap);",
    "}",
    "send({ type: 'resource', message: 'Vite preview module failed: ' + error.message, file: error.file, stack: detail });",
    "if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });",
    "else render();",
    "console.error('Vite preview module failed:', error);",
    "export {};",
    ""
  ].join("\n");
}

function viteErrorOverlayHtml(message, detail) {
  return [
    "<section style=\"box-sizing:border-box;width:min(760px,100%);border:1px solid rgba(255,209,102,.34);border-radius:16px;background:#11131f;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.35)\">",
    "<p style=\"margin:0 0 8px;color:#ffd166;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em\">Preview module failed</p>",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.2;color:#fff4c7">${escapeHtml(message)}</h1>`,
    `<pre style="box-sizing:border-box;max-height:58vh;overflow:auto;margin:0;white-space:pre-wrap;background:#070911;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;color:#f3eeff;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeHtml(detail)}</pre>`,
    "</section>"
  ].join("");
}

async function proxyRequestInit(req, target, proxyBase) {
  if (!req) return { headers: proxyRequestHeaders(req, target, proxyBase), redirect: "manual" };
  const method = String(req.method || "GET").toUpperCase();
  const init = {
    headers: proxyRequestHeaders(req, target, proxyBase),
    method,
    redirect: "manual"
  };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = await readRawRequestBody(req);
  }
  return init;
}

function proxyRequestHeaders(req, target, proxyBase) {
  const source = req?.headers ?? {};
  const allowed = [
    "accept",
    "accept-language",
    "content-type",
    "cookie",
    "x-csrf-token",
    "x-inertia",
    "x-inertia-version",
    "x-requested-with",
    "x-xsrf-token"
  ];
  const next = {};
  for (const name of allowed) {
    const value = source[name];
    if (typeof value === "string") next[name] = value;
  }
  const xsrfToken = previewXsrfHeader(next["x-xsrf-token"], next.cookie);
  if (xsrfToken) next["x-xsrf-token"] = xsrfToken;
  if (req && target) {
    if (typeof source.origin === "string") next.origin = target.origin;
    if (typeof source.referer === "string" || typeof source.referrer === "string") {
      next.referer = previewRefererToTarget(source.referer || source.referrer, req, target);
    }
    if (typeof source.host === "string") next["x-forwarded-host"] = source.host;
    next["x-forwarded-proto"] = "http";
    next["x-forwarded-prefix"] = previewCookiePath(proxyBase);
  }
  return next;
}

function previewXsrfHeader(headerValue, cookieHeader) {
  const value = typeof headerValue === "string" && headerValue.trim()
    ? headerValue
    : cookieHeaderValue(cookieHeader, "XSRF-TOKEN");
  return value ? decodeCookieValue(value) : "";
}

function cookieHeaderValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1);
  }
  return "";
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function previewRefererToTarget(referer, req, target) {
  try {
    const parsed = new URL(String(referer || ""), `http://${req.headers.host || "localhost"}`);
    const match = parsed.pathname.match(/^\/preview\/server\/([^/]+)\/([^/]+)\/?(.*)$/);
    if (!match || decodeURIComponent(match[2]) !== TOKEN) return target.toString();
    const upstream = new URL(decodeURIComponent(match[3] || ""), `${target.origin}/`);
    upstream.search = parsed.search;
    upstream.hash = parsed.hash;
    return upstream.toString();
  } catch {
    return target.toString();
  }
}

function readRawRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 10_000_000) {
        reject(new Error("Preview request body too large"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function proxyResponseHeaders(upstream, contentType, rewriteOptions) {
  const next = headers(contentType);
  for (const name of ["vary", "x-inertia"]) {
    const value = upstream.headers.get(name);
    if (value) next[name] = value;
  }
  const location = upstream.headers.get("location");
  if (location) next.Location = rewriteProxyReference(location, rewriteOptions);
  const inertiaLocation = upstream.headers.get("x-inertia-location");
  if (inertiaLocation) next["X-Inertia-Location"] = rewriteProxyReference(inertiaLocation, rewriteOptions);
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) next["Set-Cookie"] = cookies.map((cookie) => rewritePreviewCookie(cookie, rewriteOptions));
  else {
    const cookie = upstream.headers.get("set-cookie");
    if (cookie) next["Set-Cookie"] = rewritePreviewCookie(cookie, rewriteOptions);
  }
  return next;
}

function rewritePreviewCookie(cookie, { proxyBase }) {
  const parts = String(cookie || "").split(";").map((part) => part.trim()).filter(Boolean);
  const pair = parts.shift();
  if (!pair) return cookie;

  const next = [pair];
  let hasSameSite = false;
  for (const part of parts) {
    if (/^domain=/i.test(part) || /^path=/i.test(part) || /^secure$/i.test(part)) continue;
    if (/^samesite=/i.test(part)) {
      hasSameSite = true;
      next.push(/^samesite=none$/i.test(part) ? "SameSite=Lax" : part);
      continue;
    }
    next.push(part);
  }
  next.push(`Path=${previewCookiePath(proxyBase)}`);
  if (!hasSameSite) next.push("SameSite=Lax");
  return next.join("; ");
}

function previewCookiePath(proxyBase) {
  const match = String(proxyBase || "").match(/^(\/preview\/server\/[^/]+\/[^/]+\/?)/);
  if (!match) return "/";
  return match[1].endsWith("/") ? match[1] : `${match[1]}/`;
}

function rewriteProxyHtml(html, { externalProxy, proxyBase, target, token, proxyContext }) {
  const rewriteOptions = { externalProxy, proxyBase, target, token, proxyContext };
  return injectProxyRuntimeErrorOverlay(html)
    .replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (_match, open, script, close) => {
      if (!shouldRewriteInlineScript(open)) return `${open}${script}${close}`;
      return `${open}${rewriteProxyJavaScript(script, rewriteOptions)}${close}`;
    })
    .replace(/\b(src|href|action|formaction)=["']([^"']+)["']/gi, (_match, attr, value) => {
      return `${attr}="${rewriteProxyReference(value, rewriteOptions)}"`;
    })
    .replace(/\bstyle=(["'])(.*?)\1/gi, (_match, quote, value) => {
      return `style=${quote}${rewriteProxyStyleUrls(value, rewriteOptions)}${quote}`;
    });
}

function injectProxyRuntimeErrorOverlay(html) {
  const source = String(html || "");
  if (source.includes("vibyra-preview-runtime-error")) return source;
  const tag = `<script>${PROXY_RUNTIME_ERROR_SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(source)) return source.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  if (/<html[^>]*>/i.test(source)) return source.replace(/<html([^>]*)>/i, `<html$1><head>${tag}</head>`);
  return `${tag}${source}`;
}

function injectProxyHttpErrorOverlay(html, { status, target }) {
  const body = String(html || "");
  if (/\bid=["']vibyra-preview-http-error["']/i.test(body)) return body;
  const message = `Preview request failed: HTTP ${status}`;
  const detail = `${target.pathname}${target.search}\n\n${body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200)}`;
  const overlay = [
    '<main id="vibyra-preview-http-error" style="box-sizing:border-box;min-height:100vh;margin:0;padding:24px;background:#0b0d17;color:#f7f3ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;">',
    '<section style="box-sizing:border-box;width:min(760px,100%);border:1px solid rgba(255,209,102,.34);border-radius:16px;background:#11131f;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.35)">',
    '<p style="margin:0 0 8px;color:#ffd166;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em">Preview HTTP error</p>',
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.2;color:#fff4c7">${escapeHtml(message)}</h1>`,
    `<pre style="box-sizing:border-box;max-height:58vh;overflow:auto;margin:0;white-space:pre-wrap;background:#070911;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;color:#f3eeff;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeHtml(detail)}</pre>`,
    "</section></main>"
  ].join("");
  if (/<body[^>]*>/i.test(body)) return body.replace(/<body([^>]*)>/i, `<body$1>${overlay}`);
  return `${overlay}${body}`;
}

const PROXY_RUNTIME_ERROR_SCRIPT = `
(function () {
  if (window.__vibyraPreviewRuntimeErrorOverlay) return;
  window.__vibyraPreviewRuntimeErrorOverlay = true;
  function text(value) {
    return String(value || "").replace(/[&<>"]/g, function (ch) {
      return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;";
    });
  }
  function detailFrom(event) {
    var error = event && event.error;
    var reason = event && event.reason;
    var message = event && event.message || reason && reason.message || error && error.message || String(reason || "Preview runtime error");
    var stack = error && error.stack || reason && reason.stack || "";
    var file = event && event.filename || "";
    var line = event && event.lineno ? "line " + event.lineno : "";
    return { message: String(message || "Preview runtime error"), stack: String(stack || ""), file: String(file || ""), line: line };
  }
  function report(payload) {
    try {
      var next = { source: "vibyra-preview-error", type: payload.type || "error", message: payload.message, file: payload.file, stack: payload.stack, status: payload.status };
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(next));
      else if (window.parent) window.parent.postMessage(next, "*");
    } catch (_) {}
  }
  function previewBasePath() {
    var match = String(location.pathname || "").match(/^(\\/preview\\/server\\/[^\\/]+\\/[^\\/]+\\/?)/);
    if (!match) return "";
    return match[1].charAt(match[1].length - 1) === "/" ? match[1] : match[1] + "/";
  }
  function previewRequestUrl(value) {
    var raw = String(value || "");
    var base = previewBasePath();
    if (!base || !raw || /^(?:data:|blob:|mailto:|tel:|#)/i.test(raw) || raw.indexOf("/preview/") === 0) return value;
    if (raw.charAt(0) === "/") return base + raw.replace(/^\\/+/, "");
    try {
      var parsed = new URL(raw, location.href);
      if (parsed.origin === location.origin && parsed.pathname.indexOf("/preview/") !== 0) {
        return base + parsed.pathname.replace(/^\\/+/, "") + parsed.search + parsed.hash;
      }
    } catch (_) {}
    return value;
  }
  function previewRequestInput(input) {
    if (typeof input === "string") return previewRequestUrl(input);
    try {
      if (typeof Request !== "undefined" && input instanceof Request) {
        var nextUrl = previewRequestUrl(input.url);
        return nextUrl === input.url ? input : new Request(nextUrl, input);
      }
    } catch (_) {}
    return input;
  }
  function render(payload) {
    if (!payload || !payload.message || document.getElementById("vibyra-preview-runtime-error")) return;
    var root = document.body || document.documentElement;
    if (!root) return;
    var wrap = document.createElement("main");
    wrap.id = "vibyra-preview-runtime-error";
    wrap.style.cssText = "box-sizing:border-box;min-height:100vh;margin:0;padding:24px;background:#0b0d17;color:#f7f3ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;";
    var detail = [payload.file, payload.line, payload.stack].filter(Boolean).join("\\n\\n");
    wrap.innerHTML = '<section style="box-sizing:border-box;width:min(760px,100%);border:1px solid rgba(255,209,102,.34);border-radius:16px;background:#11131f;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.35)"><p style="margin:0 0 8px;color:#ffd166;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em">Preview runtime error</p><h1 style="margin:0 0 12px;font-size:22px;line-height:1.2;color:#fff4c7">' + text(payload.message) + '</h1><pre style="box-sizing:border-box;max-height:58vh;overflow:auto;margin:0;white-space:pre-wrap;background:#070911;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;color:#f3eeff;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">' + text(detail || payload.message) + '</pre></section>';
    root.appendChild(wrap);
  }
  function requestFailure(url, status, body) {
    var detail = responseDiagnosticText(body);
    var payload = {
      type: "resource",
      message: "Preview request failed: HTTP " + status,
      file: String(url || ""),
      status: status,
      stack: [String(url || ""), detail].filter(Boolean).join("\\n\\n")
    };
    report(payload);
    render(payload);
  }
  function responseDiagnosticText(body) {
    var raw = String(body || "");
    if (/<[a-z][\\s\\S]*>/i.test(raw) && window.DOMParser) {
      try {
        var doc = new DOMParser().parseFromString(raw, "text/html");
        ["#vibyra-preview-http-error", "#vibyra-preview-runtime-error", "#vibyra-vite-module-error", "script", "style", "noscript"].forEach(function (selector) {
          Array.prototype.forEach.call(doc.querySelectorAll(selector), function (node) { node.remove(); });
        });
        var title = doc.querySelector("title");
        var root = doc.body || doc.documentElement;
        var htmlText = ((title && title.textContent ? title.textContent + "\\n" : "") + (root && root.textContent || ""));
        return htmlText.replace(/\\s+/g, " ").trim().slice(0, 1200);
      } catch (_) {}
    }
    return raw.replace(/\\s+/g, " ").trim().slice(0, 1200);
  }
  if (window.fetch && !window.__vibyraPreviewFetchOverlay) {
    window.__vibyraPreviewFetchOverlay = true;
    var originalFetch = window.fetch;
    window.fetch = function (input) {
      var args = Array.prototype.slice.call(arguments);
      args[0] = previewRequestInput(args[0]);
      var url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      return originalFetch.apply(this, args).then(function (response) {
        if (response && response.status >= 400) {
          try {
            response.clone().text().then(function (body) { requestFailure(url || response.url, response.status, body); }, function () { requestFailure(url || response.url, response.status, ""); });
          } catch (_) {
            requestFailure(url || response.url, response.status, "");
          }
        }
        return response;
      });
    };
  }
  if (window.XMLHttpRequest && !window.__vibyraPreviewXhrOverlay) {
    window.__vibyraPreviewXhrOverlay = true;
    var OriginalXhr = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
      var xhr = new OriginalXhr();
      var url = "";
      var originalOpen = xhr.open;
      xhr.open = function (method, nextUrl) {
        var args = Array.prototype.slice.call(arguments);
        args[1] = previewRequestUrl(nextUrl);
        url = args[1];
        return originalOpen.apply(xhr, args);
      };
      xhr.addEventListener("load", function () {
        if (xhr.status >= 400) requestFailure(url || xhr.responseURL, xhr.status, xhr.responseText || "");
      });
      return xhr;
    };
    window.XMLHttpRequest.prototype = OriginalXhr.prototype;
  }
  function handle(event, type) {
    var payload = detailFrom(event);
    payload.type = type;
    report(payload);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { render(payload); }, { once: true });
    else render(payload);
  }
  document.addEventListener("submit", function (event) {
    var form = event && event.target;
    if (!form || !form.getAttribute) return;
    var action = form.getAttribute("action");
    if (action) form.setAttribute("action", previewRequestUrl(action));
  }, true);
  window.addEventListener("error", function (event) { if (!event.target || event.target === window) handle(event, "error"); }, true);
  window.addEventListener("unhandledrejection", function (event) { handle(event, "unhandledrejection"); });
})();
`;

function shouldRewriteInlineScript(openTag) {
  const tag = String(openTag || "");
  if (/\btype=(["'])(?:application\/json|importmap)\1/i.test(tag)) return false;
  return true;
}

function rewriteProxyCss(css, { externalProxy, proxyBase, target, token, proxyContext }) {
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
      return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote})`;
    })
    .replace(/@import\s+(["'])([^"']+)\1/gi, (_match, quote, value) => {
      return `@import ${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    });
}

function rewriteProxyStyleUrls(style, { externalProxy, proxyBase, target, token, proxyContext }) {
  return String(style).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
    return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote})`;
  });
}

function rewriteProxyJavaScript(js, { externalProxy, proxyBase, target, token, proxyContext }) {
  const rewritten = js
    .replace(/(["'`])((?:https?:\\\/\\\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)[^"'`]+)\1/gi, (_match, quote, value) => {
      return `${quote}${rewriteProxyReference(value.replace(/\\\//g, "/"), { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    })
    .replace(/(["'`])((?:https?:\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)[^"'`]+)\1/gi, (_match, quote, value) => {
      return `${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    })
    .replace(/\b((?:import|export)\s+(?:[^"'`]*?\s+from\s*)?)(["'`])((?:\/(?!\/))[^"'`]+)\2/g, (_match, prefix, quote, value) => {
      return `${prefix}${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext, forceUpstream: true })}${quote}`;
    })
    .replace(/\b(import\s*\(\s*)(["'`])((?:\/(?!\/))[^"'`]+)\2/g, (_match, prefix, quote, value) => {
      return `${prefix}${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext, forceUpstream: true })}${quote}`;
    })
    .replace(/(["'`])(\/(?!\/)[^"'`]+?\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)(?:[?#][^"'`]*)?)\1/gi, (_match, quote, value) => {
      return `${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    })
    .replace(/url\(\s*(["']?)(\/(?!\/)[^"')]+?\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)(?:[?#][^"')]*)?)\1\s*\)/gi, (_match, quote, value) => {
      return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote})`;
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

function activePreviewAssetReference(pathname) {
  if (!isRootPreviewAssetPath(pathname)) return null;
  const projectId = activePreviewProjectId();
  return projectId ? { kind: "server", projectId } : null;
}

function activePreviewProjectId() {
  const selected = appState.selectedProjectId;
  if (selected && trackedPreviewTarget(selected)) return selected;
  const running = Object.entries(appState.previewServers)
    .filter(([, tracked]) => normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url)));
  return running.length === 1 ? running[0][0] : null;
}

function isRootPreviewAssetPath(pathname) {
  const path = String(pathname || "/").split(/[?#]/)[0];
  if (!path.startsWith("/")) return false;
  if (/^\/(?:build\/assets|assets|images|img|fonts|font|media|videos|video|storage)\//i.test(path)) return true;
  return /\.(?:avif|bmp|css|gif|glb|gltf|ico|jpe?g|js|json|m4v|map|mjs|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webmanifest|webm|webp|woff2?)$/i.test(path);
}

function trackedPreviewTarget(projectId) {
  const tracked = appState.previewServers[projectId];
  return normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
}

function previewTargetFromProject(projectId, requestedPath) {
  const targetBase = trackedPreviewTarget(projectId);
  if (!targetBase) return null;
  return new URL(String(requestedPath || "/"), `${targetBase.toString().replace(/\/+$/, "")}/`);
}

function rewriteProxyReference(value, { externalProxy = false, proxyBase, target, token, proxyContext = null, forceUpstream = false }) {
  const raw = String(value).trim();
  if (!raw || /^(?:data:|blob:|mailto:|tel:|#)/i.test(raw)) return raw;
  if (raw.startsWith("/preview/")) return raw;
  if (/^https?:\/\//i.test(raw)) {
    const parsed = safeUrl(raw);
    if (!parsed || !isLocalPreviewHost(parsed.hostname)) return raw;
    return previewPathForLocalUrl(parsed, { proxyContext, token, forceUpstream }) ?? previewExternalUrl(parsed, token);
  }
  if (raw.startsWith("//")) {
    const parsed = safeUrl(`${target.protocol}${raw}`);
    if (!parsed || !isLocalPreviewHost(parsed.hostname)) return raw;
    return previewPathForLocalUrl(parsed, { proxyContext, token, forceUpstream }) ?? previewExternalUrl(parsed, token);
  }
  if (externalProxy) {
    try {
      const resolved = new URL(raw, target);
      return previewPathForLocalUrl(resolved, { proxyContext, token, forceUpstream }) ?? previewExternalUrl(resolved, token);
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

function previewPathForLocalUrl(value, { proxyContext, token, forceUpstream = false }) {
  const target = normalizeProxyTargetUrl(value);
  if (!target || !proxyContext) return null;
  if (sameOrigin(target, proxyContext.appTarget)) return appProxyPath(proxyContext.appProxyBase, target);
  if (sameOrigin(target, proxyContext.viteTarget)) {
    if (!forceUpstream && proxyContext.appTarget && isLaravelPublicAssetPath(target.pathname)) {
      return appProxyPath(proxyContext.appProxyBase, target);
    }
    return previewExternalUrl(target, token);
  }
  return null;
}

function appProxyPath(appProxyBase, target) {
  if (target.pathname === "/" && !target.search && !target.hash) return appProxyBase.replace(/\/+$/, "");
  return `${appProxyBase}${target.pathname.replace(/^\/+/, "")}${target.search}${target.hash}`;
}

function previewExternalUrl(target, token) {
  const normalized = normalizeProxyTargetUrl(target);
  if (!normalized) return "";
  return `/preview/proxy-url/${encodeURIComponent(token)}/?url=${encodeURIComponent(normalized.toString())}`;
}

function laravelPublicAssetTargetForViteProxy(target) {
  const context = previewProxyContext(target, TOKEN);
  if (!context?.appTarget || !sameOrigin(normalizeProxyTargetUrl(target), context.viteTarget)) return null;
  if (!isLaravelPublicAssetPath(target.pathname)) return null;
  return new URL(`${target.pathname}${target.search}${target.hash}`, `${context.appTarget.toString().replace(/\/+$/, "")}/`);
}

function previewProxyContext(target, token) {
  const normalizedTarget = normalizeProxyTargetUrl(target);
  if (!normalizedTarget) return null;
  for (const [projectId, tracked] of Object.entries(appState.previewServers)) {
    const appTarget = normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
    const viteTarget = normalizeProxyTargetUrl(safeUrl(tracked?.viteProxyTargetUrl));
    if (!appTarget && !viteTarget) continue;
    if (sameOrigin(normalizedTarget, appTarget) || sameOrigin(normalizedTarget, viteTarget)) {
      return {
        appProxyBase: previewServerProxyUrl(projectId, token),
        appTarget,
        projectId,
        viteTarget
      };
    }
  }
  return null;
}

function sameOrigin(a, b) {
  if (!a || !b) return false;
  return a.protocol === b.protocol && a.hostname === b.hostname && effectivePort(a) === effectivePort(b);
}

function effectivePort(url) {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

function isLaravelPublicAssetPath(pathname) {
  const clean = String(pathname || "").split(/[?#]/)[0];
  if (/^\/(?:@vite|node_modules|resources)\//i.test(clean)) return false;
  return /\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)$/i.test(clean);
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
