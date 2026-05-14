import { fetchWithTimeout } from "../../../utils/network";

export async function desktopPreviewLooksRunnable(url: string) {
  try {
    const response = await fetchWithTimeout(url, {}, 2500);
    if (!response.ok) return false;
    const html = await response.text();
    if (/\bProject analyzed\b/i.test(html)) return false;
    if (!/<!doctype\s+html|<html\b|<body\b|<script\b/i.test(html)) return false;
    return await referencedAssetsLookRunnable(url, html);
  } catch {
    return false;
  }
}

async function referencedAssetsLookRunnable(baseUrl: string, html: string) {
  const urls = referencedPreviewAssetUrls(baseUrl, html).slice(0, 8);
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, 2500);
      if (!response.ok) return false;
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
  return Array.from(new Set(urls));
}
