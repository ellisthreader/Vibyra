import type { AgentConnection } from "../types/domain";
import { fetchWithTimeout, normalizeAgentUrl } from "./network";
export type HostedDemoStatus = "ready" | "unavailable" | "failed" | "pending";
export type HostedDemoAsset = {
  body?: string;
  contentType?: string;
  encoding?: "utf8" | "base64";
  path: string;
  size?: number;
  url?: string;
};
export type HostedDemoPayload = {
  assets?: HostedDemoAsset[];
  entryPath?: string;
  entryHtml?: string;
  files?: HostedDemoAsset[];
  generatedAt?: string;
  html?: string;
  kind?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  mountDirectory?: string;
  ok?: boolean;
  source?: "desktop";
  status: HostedDemoStatus;
  url?: string | null;
};
export type HostedRuntimePayload = {
  buildCommand?: string;
  files?: HostedDemoAsset[];
  kind?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  needsRuntime?: boolean;
  ok?: boolean;
  platform?: "laravel" | "node" | "python";
  runtimeReason?: string;
  source?: "desktop";
  startCommand?: string;
  status: HostedDemoStatus;
};
type HostedDemoResponse = Partial<HostedDemoPayload> & {
  code?: string;
  demo?: Partial<HostedDemoPayload>;
  failureReasons?: string[];
  hostedDemo?: Partial<HostedDemoPayload>;
  html?: string;
  ok?: boolean;
  previewHtml?: string;
  reason?: string;
};
type HostedRuntimeResponse = Partial<HostedRuntimePayload> & {
  code?: string;
  failureReasons?: string[];
  reason?: string;
};
type BundleRequest = {
  agentUrl: string;
  connection: AgentConnection | null;
  projectId: string;
};
export function requestHostedDemoBundle(args: BundleRequest): Promise<HostedDemoPayload | null> {
  return requestDesktopBundle(args, "publish-demo-bundle", 330000, normalizeHostedDemo, failedHostedDemo);
}
export function requestHostedRuntimeBundle(args: BundleRequest): Promise<HostedRuntimePayload | null> {
  return requestDesktopBundle(args, "publish-runtime-bundle", 180000, normalizeHostedRuntime, failedHostedRuntime);
}
async function requestDesktopBundle<T>(
  { agentUrl, connection, projectId }: BundleRequest,
  route: string,
  timeoutMs: number,
  normalize: (payload: unknown) => T,
  failed: (payload: unknown) => T
): Promise<T | null> {
  if (!connection) return null;
  const headers: Record<string, string> = {};
  if (connection.token) headers.Authorization = `Bearer ${connection.token}`;
  for (const baseUrl of desktopUrls(agentUrl, connection)) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/files/${route}?projectId=${encodeURIComponent(projectId)}`,
        { headers, method: "GET" },
        timeoutMs
      );
      if (response.status === 404) continue;
      const payload = await response.json().catch(() => ({}));
      return response.ok ? normalize(payload) : failed(payload);
    } catch (error) {
      if (isNetworkRouteMiss(error)) continue;
      return failed({ error: error instanceof Error ? error.message : "Desktop bundle request failed." });
    }
  }
  return null;
}
function desktopUrls(agentUrl: string, connection: AgentConnection) {
  return Array.from(new Set([
    normalizeAgentUrl(connection.url),
    normalizeAgentUrl(agentUrl),
    ...(connection.connectionUrls ?? []).map(normalizeAgentUrl)
  ].filter(Boolean)));
}
function normalizeHostedDemo(value: unknown): HostedDemoPayload {
  const payload = value as HostedDemoResponse;
  const demo = payload.hostedDemo ?? payload.demo ?? payload;
  const entryHtml = demo.entryHtml || demo.html || payload.previewHtml || payload.html;
  const files = Array.isArray((demo as HostedDemoPayload).files) ? (demo as HostedDemoPayload).files : undefined;
  const reportedOk = payload.ok === true || demo.ok === true;
  const ok = reportedOk && hasUsableHostedDemoBundle(demo.entryPath, files);
  const reportedMessage = demo.message
    ?? payload.message
    ?? payload.reason
    ?? (Array.isArray(payload.failureReasons) ? payload.failureReasons[0] : undefined);
  const message = reportedOk && !ok
    ? reportedMessage ?? "Desktop returned an incomplete hosted demo bundle."
    : reportedMessage;
  return {
    assets: demo.assets,
    entryPath: (demo as HostedDemoPayload).entryPath,
    entryHtml,
    files,
    generatedAt: demo.generatedAt,
    html: entryHtml,
    kind: (demo as HostedDemoPayload).kind,
    message,
    metadata: (demo as HostedDemoPayload).metadata,
    mountDirectory: (demo as HostedDemoPayload).mountDirectory,
    ok,
    source: "desktop",
    status: ok ? "ready" : "unavailable",
    url: demo.url ?? null
  };
}

function failedHostedDemo(payload: unknown): HostedDemoPayload {
  const message = responseMessage(payload) ?? "Desktop could not prepare a hosted demo bundle.";
  return { message, source: "desktop", status: "failed" };
}

function normalizeHostedRuntime(value: unknown): HostedRuntimePayload {
  const payload = value as HostedRuntimeResponse;
  const reportedOk = payload.ok === true;
  const files = Array.isArray(payload.files) ? payload.files : undefined;
  const ok = reportedOk && hasUsableRuntimeBundle(payload.platform, files);
  const reportedMessage = payload.message
    ?? payload.reason
    ?? (Array.isArray(payload.failureReasons) ? payload.failureReasons[0] : undefined);
  return {
    buildCommand: payload.buildCommand,
    files,
    kind: payload.kind,
    message: reportedOk && !ok
      ? reportedMessage ?? "Desktop returned an incomplete runtime bundle."
      : reportedMessage,
    metadata: payload.metadata,
    needsRuntime: payload.needsRuntime,
    ok,
    platform: payload.platform,
    runtimeReason: payload.runtimeReason,
    source: "desktop",
    startCommand: payload.startCommand,
    status: ok ? "pending" : "unavailable"
  };
}

function failedHostedRuntime(payload: unknown): HostedRuntimePayload {
  const message = responseMessage(payload) ?? "Desktop could not prepare a runtime bundle.";
  return { message, source: "desktop", status: "failed" };
}

function isNetworkRouteMiss(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("network request failed")
    || message.includes("failed to fetch")
    || message.includes("request timed out")
    || message.includes("load failed");
}

function hasUsableHostedDemoBundle(entryPath: string | undefined, files: HostedDemoAsset[] | undefined) {
  const normalizedEntry = normalizeBundlePath(entryPath);
  return Boolean(normalizedEntry && files?.some((file) => normalizeBundlePath(file.path) === normalizedEntry && Boolean(file.body)));
}

function hasUsableRuntimeBundle(platform: HostedRuntimePayload["platform"], files: HostedDemoAsset[] | undefined) {
  const requiredPaths = platform === "laravel"
    ? ["composer.json"]
    : platform === "node"
      ? ["package.json"]
      : platform === "python"
        ? ["requirements.txt", "pyproject.toml"]
        : [];
  return Boolean(requiredPaths.length && files?.some((file) => requiredPaths.includes(normalizeBundlePath(file.path)) && Boolean(file.body)));
}

function normalizeBundlePath(value: string | undefined) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function responseMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { error?: unknown; failureReasons?: unknown; message?: unknown; reason?: unknown };
  const direct = [value.error, value.message, value.reason].find((item) => typeof item === "string" && item.trim());
  if (typeof direct === "string") return direct;
  if (!Array.isArray(value.failureReasons)) return undefined;
  return value.failureReasons.find((item): item is string => typeof item === "string" && Boolean(item.trim()));
}
