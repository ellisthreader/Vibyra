import { DESKTOP_RELAY_URL } from "../data/appData";

export function trustedDesktopUrl(value: string): string | null {
  const parsed = parseDesktopUrl(value);
  if (!parsed) return null;
  if (!strictDesktopUrlsEnabled()) return parsed.origin;

  if (parsed.protocol === "http:" && isPrivateOrLoopbackHost(parsed.hostname)) {
    return parsed.origin;
  }
  if (parsed.protocol === "https:" && approvedRelayOrigins().has(parsed.origin)) {
    return parsed.origin;
  }
  return null;
}

export function trustedDesktopUrls(values: string[]) {
  return Array.from(new Set(values.map(trustedDesktopUrl).filter((url): url is string => Boolean(url))));
}

export function makePairRequestId(now = Date.now()) {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `phone-pair-${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return `phone-pair-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  // Older React Native runtimes may not expose Web Crypto. This fallback is
  // isolated for compatibility and is not used as a credential or secret.
  return `phone-pair-compat-${now}-${Math.random().toString(36).slice(2, 14)}`;
}

function strictDesktopUrlsEnabled() {
  return process.env.EXPO_PUBLIC_STRICT_DESKTOP_URLS !== "false";
}

function approvedRelayOrigins() {
  return new Set([
    DESKTOP_RELAY_URL,
    process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL,
    process.env.EXPO_PUBLIC_DESKTOP_URL
  ].map(httpsOrigin).filter((origin): origin is string => Boolean(origin)));
}

function httpsOrigin(value: string | undefined) {
  const parsed = parseDesktopUrl(value ?? "");
  return parsed?.protocol === "https:" ? parsed.origin : null;
}

function parseDesktopUrl(value: string) {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    if (hasEncodedIpHost(trimmed, parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasEncodedIpHost(rawUrl: string, parsedHostname: string) {
  const match = rawUrl.match(/^https?:\/\/(\[[^\]]+\]|[^:/?#]+)/i);
  const rawHost = String(match?.[1] ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  const normalizedHost = parsedHostname.toLowerCase().replace(/^\[|\]$/g, "");
  return rawHost !== normalizedHost && /^\d|^0x/i.test(rawHost);
}

function isPrivateOrLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  if (host.includes(":")) return /^(?:fc|fd)[0-9a-f]{2}:|^fe[89ab][0-9a-f]:/i.test(host);
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [first, second] = parts.map(Number);
  return first === 10
    || first === 127
    || first === 192 && second === 168
    || first === 172 && second >= 16 && second <= 31
    || first === 169 && second === 254;
}
