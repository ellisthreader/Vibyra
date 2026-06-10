export const PRODUCTION_APP_API_URL = "https://vibyra-production.up.railway.app";

export type AppApiOriginPolicy = {
  allowedOrigins: string[];
  candidates: string[];
  redirect: RequestRedirect;
};

type AppApiOriginPolicyInput = {
  configuredUrl?: string;
  developmentDefaultUrl: string;
  developmentFallbackUrls: string[];
  isDevelopment: boolean;
};

export function createAppApiOriginPolicy(input: AppApiOriginPolicyInput): AppApiOriginPolicy {
  if (!input.isDevelopment) {
    const approvedOrigin = httpsOrigin(input.configuredUrl) ?? PRODUCTION_APP_API_URL;
    return {
      allowedOrigins: [approvedOrigin],
      candidates: [approvedOrigin],
      redirect: "error"
    };
  }

  const candidates = uniqueUrls([
    input.configuredUrl || input.developmentDefaultUrl,
    ...input.developmentFallbackUrls
  ]);
  return {
    allowedOrigins: candidates,
    candidates,
    redirect: "follow"
  };
}

export function appApiRetryCandidates(policy: AppApiOriginPolicy, failedUrl: string) {
  const normalizedFailedUrl = normalizeBaseUrl(failedUrl);
  return policy.candidates.filter((candidate) => candidate !== normalizedFailedUrl);
}

export function isAllowedAppApiUrl(policy: AppApiOriginPolicy, url: string) {
  return Boolean(approvedAppApiUrl(policy, url));
}

export function approvedAppApiUrl(policy: AppApiOriginPolicy, url: string) {
  const normalized = normalizeBaseUrl(url);
  if (!normalized) return null;
  return policy.allowedOrigins.find((origin) => origin === normalized) ?? null;
}

function httpsOrigin(value?: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `http://${trimmed}`;
}

function uniqueUrls(values: string[]) {
  return Array.from(new Set(values.map(normalizeBaseUrl).filter(Boolean)));
}
