export type WebViewNavigationPolicy =
  | { kind: "blocked" }
  | { kind: "inline" }
  | { kind: "url"; origin: string };

export function createWebViewNavigationPolicy(
  html?: string,
  url?: string,
  publicDemo = false
): WebViewNavigationPolicy {
  if (publicDemo) {
    if (html || !url) return { kind: "blocked" };
    const parsed = parseWebUrl(url);
    return parsed?.protocol === "https:"
      ? { kind: "url", origin: parsed.origin }
      : { kind: "blocked" };
  }

  if (html || !url) return { kind: "inline" };

  const parsed = parseWebUrl(url);
  return parsed ? { kind: "url", origin: parsed.origin } : { kind: "inline" };
}

export function isWebViewNavigationAllowed(policy: WebViewNavigationPolicy, candidate: string) {
  if (policy.kind === "blocked") return false;
  if (policy.kind === "inline") return isAboutBlank(candidate);

  const parsed = parseWebUrl(candidate);
  return parsed?.origin === policy.origin;
}

function parseWebUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isAboutBlank(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "about:" && parsed.pathname === "blank";
  } catch {
    return false;
  }
}
