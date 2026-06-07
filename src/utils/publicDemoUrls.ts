export function sanitizePublicDemoUrl(url?: string | null) {
  const value = String(url ?? "").trim();
  if (!value || !/^https?:\/\//i.test(value)) return undefined;

  try {
    const parsed = new URL(value);
    if (isLocalOrPrivateHost(parsed.hostname) && isFirstPartyCommunityDemoPath(parsed) && localDemoUrlsAllowed()) return parsed.href;
    if (parsed.protocol !== "https:") return undefined;
    if (isLocalOrPrivateHost(parsed.hostname)) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

export function publicDemoUrlBlockedReason(url?: string | null) {
  const value = String(url ?? "").trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) return "Demo URL is not a web address.";

  try {
    const parsed = new URL(value);
    if (isLocalOrPrivateHost(parsed.hostname) && isFirstPartyCommunityDemoPath(parsed) && localDemoUrlsAllowed()) return "";
    if (isLocalOrPrivateHost(parsed.hostname)) return "Demo URL points to a private or local network.";
    if (parsed.protocol !== "https:") return "Public demos must use HTTPS.";
  } catch {
    return "Demo URL is invalid.";
  }

  return "";
}

export function firstPublicDemoUrl(urls: Array<string | null | undefined>) {
  for (const url of urls) {
    const safeUrl = sanitizePublicDemoUrl(url);
    if (safeUrl) return safeUrl;
  }
  return undefined;
}

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  if (!isIpv4Address(host)) return false;

  const [first, second] = host.split(".").map(Number);
  return first === 0
    || first === 10
    || first === 127
    || first === 192 && second === 168
    || first === 172 && second >= 16 && second <= 31
    || first === 169 && second === 254;
}

function isIpv4Address(value: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false;
  return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function isFirstPartyCommunityDemoPath(url: URL) {
  if (!url.pathname.startsWith("/api/community/projects/")) return false;
  return url.pathname.endsWith("/demo")
    || url.pathname.includes("/demo/")
    || url.pathname.endsWith("/preview");
}

function localDemoUrlsAllowed() {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true
    || process.env.EXPO_PUBLIC_ALLOW_PRIVATE_DEMO_URLS === "true";
}
