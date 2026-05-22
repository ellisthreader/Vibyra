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

type HostedDemoResponse = Partial<HostedDemoPayload> & {
  demo?: Partial<HostedDemoPayload>;
  hostedDemo?: Partial<HostedDemoPayload>;
  html?: string;
  ok?: boolean;
  previewHtml?: string;
};

export async function requestHostedDemoBundle({
  agentUrl,
  connection,
  projectId
}: {
  agentUrl: string;
  connection: AgentConnection | null;
  projectId: string;
}): Promise<HostedDemoPayload | null> {
  if (!connection) return null;
  const headers: Record<string, string> = {};
  if (connection.token) headers.Authorization = `Bearer ${connection.token}`;
  for (const baseUrl of desktopUrls(agentUrl, connection)) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/files/publish-demo-bundle?projectId=${encodeURIComponent(projectId)}`,
        { headers, method: "GET" },
        45000
      );
      if (response.status === 404) return null;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return failedHostedDemo(payload);
      return normalizeHostedDemo(payload);
    } catch (error) {
      if (isNetworkRouteMiss(error)) continue;
      return { message: error instanceof Error ? error.message : "Hosted demo bundle failed.", source: "desktop", status: "failed" };
    }
  }
  return null;
}

function desktopUrls(agentUrl: string, connection: AgentConnection) {
  return Array.from(new Set([
    normalizeAgentUrl(connection.url ?? agentUrl),
    ...(connection.connectionUrls ?? []).map(normalizeAgentUrl)
  ].filter(Boolean)));
}

function normalizeHostedDemo(payload: HostedDemoResponse): HostedDemoPayload {
  const demo = payload.hostedDemo ?? payload.demo ?? payload;
  const entryHtml = demo.entryHtml || demo.html || payload.previewHtml || payload.html;
  const files = Array.isArray((demo as HostedDemoPayload).files) ? (demo as HostedDemoPayload).files : undefined;
  const ok = payload.ok === true || demo.ok === true;
  const status = demo.status ?? (ok || entryHtml || demo.url ? "ready" : "unavailable");
  return {
    assets: demo.assets,
    entryPath: (demo as HostedDemoPayload).entryPath,
    entryHtml,
    files,
    generatedAt: demo.generatedAt,
    html: entryHtml,
    kind: (demo as HostedDemoPayload).kind,
    message: demo.message,
    metadata: (demo as HostedDemoPayload).metadata,
    mountDirectory: (demo as HostedDemoPayload).mountDirectory,
    ok,
    source: "desktop",
    status,
    url: demo.url ?? null
  };
}

function failedHostedDemo(payload: unknown): HostedDemoPayload {
  const message = payload && typeof payload === "object" && "error" in payload
    ? String(payload.error)
    : "Desktop could not prepare a hosted demo bundle.";
  return { message, source: "desktop", status: "failed" };
}

function isNetworkRouteMiss(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("network request failed") || message.includes("failed to fetch");
}
