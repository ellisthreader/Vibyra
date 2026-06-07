import { fetchWithTimeout, normalizeAgentUrl } from "./network";

type DesktopPreviewConnection = {
  connectionUrls?: string[];
  token?: string;
  url: string;
};

export function absoluteDesktopPreviewUrl(baseUrl: string, previewUrl?: string | null) {
  const value = String(previewUrl ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${normalizeAgentUrl(baseUrl)}${value.startsWith("/") ? value : `/${value}`}`;
}

export async function resolveReachableDesktopPreviewUrl(connection: DesktopPreviewConnection, previewUrl?: string | null) {
  for (const url of desktopPreviewUrlCandidates(connection, previewUrl)) {
    const resolved = await resolveRunnableDesktopPreviewUrl(url);
    if (resolved) return resolved;
  }
  return null;
}

export function desktopPreviewUrlCandidates(connection: DesktopPreviewConnection, previewUrl?: string | null) {
  const value = String(previewUrl ?? "").trim();
  if (!value) return [];

  const desktopBases = uniqueValues([connection.url, ...(connection.connectionUrls ?? [])].map(normalizeAgentUrl));
  const primaryBase = desktopBases[0] ?? "";
  const firstUrl = /^https?:\/\//i.test(value) ? value : absoluteDesktopPreviewUrl(primaryBase, value);
  const candidates = /^https?:\/\//i.test(value)
    ? desktopProxyCandidates(desktopBases, connection.token, value)
    : [firstUrl];

  if (!/^https?:\/\//i.test(value)) {
    for (const base of desktopBases.slice(1)) candidates.push(absoluteDesktopPreviewUrl(base, value));
    return uniqueValues(candidates);
  }

  const parsedPreview = safeUrl(firstUrl);
  if (!parsedPreview) return uniqueValues(candidates);

  for (const base of desktopBases) {
    const parsedBase = safeUrl(base);
    if (!parsedBase) continue;
    const next = new URL(parsedPreview.toString());
    next.hostname = parsedBase.hostname;
    candidates.push(next.toString());
  }

  return uniqueValues(candidates);
}

function desktopProxyCandidates(desktopBases: string[], token: string | undefined, targetUrl: string) {
  const cleanToken = String(token ?? "").trim();
  const proxied = cleanToken
    ? desktopBases.map((base) => `${base}/preview/proxy-url/${encodeURIComponent(cleanToken)}/?url=${encodeURIComponent(targetUrl)}`)
    : [];
  return [...proxied, targetUrl];
}

export async function resolveRunnableDesktopPreviewUrl(url: string) {
  try {
    const response = await fetchWithTimeout(url, {}, 2500);
    const html = await response.text();
    if (!response.ok && !isDesktopPreviewDiagnosticHtml(url, response.status, html)) return null;
    if (/\bProject analyzed\b/i.test(html)) return null;
    if (!/<!doctype\s+html|<html\b|<body\b|<script\b/i.test(html)) return null;
    const resolvedUrl = response.url || url;
    return await referencedAssetsLookRunnable(resolvedUrl, html) ? resolvedUrl : null;
  } catch {
    return null;
  }
}

function isDesktopPreviewDiagnosticHtml(url: string, status: number, html: string) {
  if (status < 400 || !/\/preview\/server\//i.test(url)) return false;
  return /\bvibyra-preview-http-error\b|Preview HTTP error|Preview request failed: HTTP/i.test(html);
}

async function referencedAssetsLookRunnable(baseUrl: string, html: string) {
  const urls = referencedPreviewAssetUrls(baseUrl, html).slice(0, 8);
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, 2500);
      if (!response.ok) {
        if (isDevSourceModuleFailure(url, response.status)) continue;
        return false;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (/\.(?:jsx?|tsx?|mjs)(?:[?#]|$)/i.test(url) && !/(?:javascript|text\/plain|application\/octet-stream)/i.test(contentType)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function referencedPreviewAssetUrls(baseUrl: string, html: string) {
  const urls: string[] = [];
  const collect = (pattern: RegExp) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const raw = match[1] ?? "";
      if (!raw || /^(?:data:|blob:|mailto:|tel:|#)/i.test(raw)) continue;
      try {
        urls.push(new URL(raw, baseUrl).toString());
      } catch {
        urls.push(raw);
      }
    }
  };
  collect(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi);
  collect(/<link\b(?=[^>]*\brel\s*=\s*["']?(?:stylesheet|modulepreload|preload))[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi);
  return uniqueValues(urls);
}

function isDevSourceModuleFailure(url: string, status: number) {
  if (status < 500 || status > 599) return false;
  return previewAssetPaths(url).some((path) => {
    return /^\/(?:@fs\/|src\/|resources\/|app\/|pages\/|components\/)/i.test(path)
      && /\.(?:jsx?|tsx?|mjs|vue|svelte)(?:[?#]|$)/i.test(path);
  });
}

function previewAssetPaths(url: string) {
  const paths: string[] = [];
  const parsed = safeUrl(url);
  if (!parsed) return paths;
  paths.push(parsed.pathname);
  const target = safeUrl(parsed.searchParams.get("url") ?? "");
  if (target) paths.push(target.pathname);
  return paths;
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
