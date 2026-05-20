import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl } from "./previewUrls.mjs";


export function previewReferenceFromReferer(referer, requestUrl) {
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

export function canProxyPreviewFallbackPath(pathname) {
  const path = String(pathname || "/");
  return !path.startsWith("/preview/")
    && !path.startsWith("/desktop/")
    && !path.startsWith("/app-assets/")
    && path !== "/desktop"
    && path !== "/health"
    && path !== "/pair"
    && path !== "/pair/status";
}

export function activePreviewAssetReference(pathname) {
  if (!isRootPreviewAssetPath(pathname)) return null;
  const projectId = activePreviewProjectId();
  return projectId ? { kind: "server", projectId } : null;
}

export function activePreviewProjectId() {
  const selected = appState.selectedProjectId;
  if (selected && trackedPreviewTarget(selected)) return selected;
  const running = Object.entries(appState.previewServers)
    .filter(([, tracked]) => normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url)));
  return running.length === 1 ? running[0][0] : null;
}

export function isRootPreviewAssetPath(pathname) {
  const path = String(pathname || "/").split(/[?#]/)[0];
  if (!path.startsWith("/")) return false;
  if (/^\/(?:build\/assets|assets|images|img|fonts|font|media|videos|video|storage)\//i.test(path)) return true;
  return /\.(?:avif|bmp|css|gif|glb|gltf|ico|jpe?g|js|json|m4v|map|mjs|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webmanifest|webm|webp|woff2?)$/i.test(path);
}

export function trackedPreviewTarget(projectId) {
  const tracked = appState.previewServers[projectId];
  return normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
}

export function previewTargetFromProject(projectId, requestedPath) {
  const targetBase = trackedPreviewTarget(projectId);
  if (!targetBase) return null;
  return new URL(String(requestedPath || "/"), `${targetBase.toString().replace(/\/+$/, "")}/`);
}

export function rewriteProxyReference(value, { externalProxy = false, proxyBase, target, token, proxyContext = null, forceUpstream = false }) {
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

export function previewPathForLocalUrl(value, { proxyContext, token, forceUpstream = false }) {
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

export function appProxyPath(appProxyBase, target) {
  if (target.pathname === "/" && !target.search && !target.hash) return appProxyBase.replace(/\/+$/, "");
  return `${appProxyBase}${target.pathname.replace(/^\/+/, "")}${target.search}${target.hash}`;
}

export function previewExternalUrl(target, token) {
  const normalized = normalizeProxyTargetUrl(target);
  if (!normalized) return "";
  return `/preview/proxy-url/${encodeURIComponent(token)}/?url=${encodeURIComponent(normalized.toString())}`;
}

export function laravelPublicAssetTargetForViteProxy(target) {
  const context = previewProxyContext(target, TOKEN);
  if (!context?.appTarget || !sameOrigin(normalizeProxyTargetUrl(target), context.viteTarget)) return null;
  if (!isLaravelPublicAssetPath(target.pathname)) return null;
  return new URL(`${target.pathname}${target.search}${target.hash}`, `${context.appTarget.toString().replace(/\/+$/, "")}/`);
}

export function previewProxyContext(target, token) {
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

export function sameOrigin(a, b) {
  if (!a || !b) return false;
  return a.protocol === b.protocol && a.hostname === b.hostname && effectivePort(a) === effectivePort(b);
}

export function effectivePort(url) {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

export function isLaravelPublicAssetPath(pathname) {
  const clean = String(pathname || "").split(/[?#]/)[0];
  if (/^\/(?:@vite|node_modules|resources)\//i.test(clean)) return false;
  return /\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)$/i.test(clean);
}

export function safeUrl(value) {
  try {
    return new URL(String(value ?? ""));
  } catch {
    return null;
  }
}

export function isLocalPreviewHost(hostname) {
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

export function normalizeProxyTargetUrl(target) {
  if (!target) return null;
  const next = new URL(target.toString());
  if (isLocalPreviewHost(next.hostname)) next.hostname = "127.0.0.1";
  return next;
}
