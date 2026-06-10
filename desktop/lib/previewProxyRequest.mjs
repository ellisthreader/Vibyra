import { headers } from "./http.mjs";
import { previewCredentialAllowsProject } from "./previewCapabilities.mjs";
import { readRawRequestBody } from "./previewProxyBody.mjs";
import { TOKEN } from "./state.mjs";
import { rewriteProxyReference } from "./previewProxyReferences.mjs";


export async function proxyRequestInit(req, target, proxyBase, options = {}) {
  if (!req) return { headers: proxyRequestHeaders(req, target, proxyBase), redirect: "manual" };
  const method = String(req.method || "GET").toUpperCase();
  const init = {
    headers: proxyRequestHeaders(req, target, proxyBase),
    method,
    redirect: "manual"
  };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = await readRawRequestBody(req, options.maxBodyBytes);
  }
  return init;
}

export function proxyRequestHeaders(req, target, proxyBase) {
  const source = req?.headers ?? {};
  const allowed = [
    "accept",
    "accept-language",
    "content-type",
    "cookie",
    "if-range",
    "range",
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

export function cookieHeaderValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1);
  }
  return "";
}

export function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function previewRefererToTarget(referer, req, target) {
  try {
    const parsed = new URL(String(referer || ""), `http://${req.headers.host || "localhost"}`);
    const match = parsed.pathname.match(/^\/preview\/server\/([^/]+)\/([^/]+)\/?(.*)$/);
    const projectId = match ? decodeURIComponent(match[1]) : "";
    const credential = match ? decodeURIComponent(match[2]) : "";
    if (!match || !previewCredentialAllowsProject(credential, projectId, { legacyToken: TOKEN })) {
      return target.toString();
    }
    const upstream = new URL(decodeURIComponent(match[3] || ""), `${target.origin}/`);
    upstream.search = parsed.search;
    upstream.hash = parsed.hash;
    return upstream.toString();
  } catch {
    return target.toString();
  }
}

export function proxyResponseHeaders(upstream, contentType, rewriteOptions) {
  const next = headers(contentType);
  for (const name of ["vary", "x-inertia"]) {
    const value = upstream.headers.get(name);
    if (value) next[name] = value;
  }
  for (const name of mediaResponseHeaderNames(contentType, upstream)) {
    const value = upstream.headers.get(name);
    if (value) next[canonicalHeaderName(name)] = value;
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

export function mediaResponseHeaderNames(contentType, upstream) {
  if (isMutableProxyContent(contentType)) return ["cache-control", "etag", "last-modified"];
  const names = ["accept-ranges", "cache-control", "content-disposition", "content-range", "etag", "last-modified"];
  if (!upstream.headers.get("content-encoding")) names.push("content-length");
  return names;
}

export function isMutableProxyContent(contentType) {
  return /^text\/|javascript|json|xml|svg/i.test(String(contentType || ""));
}

export function canonicalHeaderName(name) {
  return String(name).split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part).join("-");
}

export function rewritePreviewCookie(cookie, { proxyBase }) {
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

export function previewCookiePath(proxyBase) {
  const match = String(proxyBase || "").match(/^(\/preview\/server\/[^/]+\/[^/]+\/?)/);
  if (!match) return "/";
  return match[1].endsWith("/") ? match[1] : `${match[1]}/`;
}
