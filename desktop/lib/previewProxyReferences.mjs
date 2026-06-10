import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl } from "./previewUrls.mjs";
import {
  legacyPreviewTokenEnabled,
  previewCredentialAllowsProject,
  previewCredentialProjectId,
  previewCredentialTargetId
} from "./previewCapabilities.mjs";
import { envFlagEnabled } from "./previewProxyLimits.mjs";
import { allPreviewServices, previewService } from "./previewServices.mjs";

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
  if (match && previewCredentialAllowsProject(decodeURIComponent(match[2]), decodeURIComponent(match[1]), { legacyToken: TOKEN })) {
    return { kind: "server", projectId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) };
  }

  match = refUrl.pathname.match(/^\/preview\/project\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (match && previewCredentialAllowsProject(decodeURIComponent(match[2]), decodeURIComponent(match[1]), { legacyToken: TOKEN })) {
    return { kind: "project", projectId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) };
  }

  match = refUrl.pathname.match(/^\/preview\/proxy-url\/([^/]+)(?:\/|$)/);
  if (match) {
    const credential = decodeURIComponent(match[1]);
    const target = normalizeProxyTargetUrl(safeUrl(refUrl.searchParams.get("url")));
    if (previewProxyTargetAllowed(target, credential)) {
      return { kind: "external", target, token: credential };
    }
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

export function trackedPreviewTarget(projectId, credential = "") {
  const targetId = previewCredentialTargetId(credential, { legacyToken: TOKEN });
  const tracked = targetId ? previewService(projectId, targetId) : appState.previewServers[projectId];
  return normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
}

export function previewTargetFromProject(projectId, requestedPath, credential = "") {
  const targetBase = trackedPreviewTarget(projectId, credential);
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
  if (sameOrigin(target, proxyContext.appTarget)) {
    return proxyContext.appProxyBase ? appProxyPath(proxyContext.appProxyBase, target) : previewExternalUrl(target, token);
  }
  if (sameOrigin(target, proxyContext.viteTarget)) {
    if (!forceUpstream && proxyContext.appTarget && isLaravelPublicAssetPath(target.pathname)) {
      const appAsset = new URL(`${target.pathname}${target.search}${target.hash}`, proxyContext.appTarget);
      return proxyContext.appProxyBase
        ? appProxyPath(proxyContext.appProxyBase, appAsset)
        : previewExternalUrl(appAsset, token);
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

export function laravelPublicAssetTargetForViteProxy(target, credential) {
  const projectId = previewCredentialProjectId(credential, { legacyToken: TOKEN });
  const context = previewProxyContext(target, credential, projectId);
  if (!context?.appTarget || !sameOrigin(normalizeProxyTargetUrl(target), context.viteTarget)) return null;
  if (!isLaravelPublicAssetPath(target.pathname)) return null;
  return new URL(`${target.pathname}${target.search}${target.hash}`, `${context.appTarget.toString().replace(/\/+$/, "")}/`);
}

export function previewProxyContext(target, token, expectedProjectId = "") {
  const normalizedTarget = normalizeProxyTargetUrl(target);
  if (!normalizedTarget) return null;
  for (const { projectId, service: tracked } of allPreviewServices()) {
    if (expectedProjectId && projectId !== expectedProjectId) continue;
    const appTarget = normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
    const viteTarget = normalizeProxyTargetUrl(safeUrl(tracked?.viteProxyTargetUrl));
    if (!appTarget && !viteTarget) continue;
    if (sameOrigin(normalizedTarget, appTarget) || sameOrigin(normalizedTarget, viteTarget)) {
      return {
        appProxyBase: appState.previewServers[projectId] === tracked ? previewServerProxyUrl(projectId, token) : "",
        appTarget,
        projectId,
        viteTarget
      };
    }
  }
  return null;
}

export function previewProxyTargetAllowed(target, credential) {
  const normalizedTarget = normalizeProxyTargetUrl(target);
  if (!normalizedTarget || !["http:", "https:"].includes(normalizedTarget.protocol)) return false;

  const projectId = previewCredentialProjectId(credential, { legacyToken: TOKEN });
  const contextProjectId = previewProxyContext(normalizedTarget, credential, projectId)?.projectId || "";
  if (credential === TOKEN) {
    if (!legacyPreviewTokenEnabled()) return false;
    return Boolean(contextProjectId) || legacyArbitraryPreviewProxyEnabled();
  }
  return Boolean(projectId && projectId === contextProjectId);
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

function legacyArbitraryPreviewProxyEnabled() { return envFlagEnabled("VIBYRA_LEGACY_PREVIEW_ARBITRARY_PROXY_ENABLED"); }
