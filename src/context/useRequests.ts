import { AgentConnection } from "../types/domain";
import { fetchWithTimeout, normalizeAgentUrl } from "../utils/network";

type RequestConfig = {
  agentUrl: string;
  connection: AgentConnection | null;
  onInvalidDesktopSession?: (message: string) => void;
  onDesktopRequestUrlResolved?: (url: string) => void;
};

export class DesktopRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly payload: unknown
  ) {
    super(message);
    this.name = "DesktopRequestError";
  }
}

const DEFAULT_TIMEOUT_MS = 5000;
const ROUTE_TIMEOUTS = [
  { matches: (endpoint: string) => endpoint === "/agents/start", timeoutMs: 190000 },
  { matches: (endpoint: string) => endpoint === "/agents/apply", timeoutMs: 30000 },
  { matches: (endpoint: string) => endpoint === "/agents/discard", timeoutMs: 10000 },
  { matches: (endpoint: string) => endpoint === "/commands/run", timeoutMs: 25000 },
  { matches: (endpoint: string) => endpoint === "/preview/start-server", timeoutMs: 90000 },
  { matches: (endpoint: string) => endpoint.startsWith("/desktop/browse"), timeoutMs: 15000 },
  { matches: (endpoint: string) => endpoint.startsWith("/desktop/context"), timeoutMs: 20000 },
  { matches: (endpoint: string) => endpoint.startsWith("/desktop/folders"), timeoutMs: 15000 },
  { matches: (endpoint: string) => endpoint.startsWith("/desktop/search"), timeoutMs: 15000 },
  { matches: (endpoint: string) => endpoint.startsWith("/files?"), timeoutMs: 15000 },
  { matches: (endpoint: string) => endpoint.startsWith("/files/read?"), timeoutMs: 10000 },
  { matches: (endpoint: string) => endpoint === "/projects", timeoutMs: 15000 },
  { matches: (endpoint: string) => endpoint === "/events", timeoutMs: 3500 }
];

export function useRequests({ agentUrl, connection, onDesktopRequestUrlResolved, onInvalidDesktopSession }: RequestConfig) {
  async function desktopRequest<T>(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = timeoutForEndpoint(endpoint)
  ): Promise<T> {
    const headers = makeHeaders(options);
    const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, { ...options, headers }, timeoutMs);
    return parseResponse<T>(response);
  }

  async function agentRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    useAuth = true
  ): Promise<T> {
    const headers = makeHeaders(options);
    if (useAuth && connection?.token) {
      headers.Authorization = `Bearer ${connection.token}`;
    }

    const timeoutMs = timeoutForEndpoint(endpoint);
    const urls = agentRequestUrls(endpoint, options, connection, agentUrl);
    let lastError: unknown = null;
    for (const baseUrl of urls) {
      try {
        const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, { ...options, headers }, timeoutMs);
        const payload = await parseResponse<T>(response);
        onDesktopRequestUrlResolved?.(baseUrl);
        return payload;
      } catch (error) {
        if (isInvalidDesktopSessionError(error)) {
          const message = error instanceof Error ? error.message : "Desktop session expired";
          onInvalidDesktopSession?.(message);
          throw new Error("Your secure desktop session expired. Reconnect this phone to Vibyra Desktop.");
        }
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Vibyra Desktop request failed");
  }

  return { agentRequest, desktopRequest };
}

function timeoutForEndpoint(endpoint: string) {
  return ROUTE_TIMEOUTS.find((route) => route.matches(endpoint))?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

function agentRequestUrls(endpoint: string, options: RequestInit, connection: AgentConnection | null, agentUrl: string) {
  const primary = normalizeAgentUrl(connection?.url ?? agentUrl);
  if (!connection || !canTryConnectionFallback(endpoint, options)) return [primary];
  return uniqueValues([
    primary,
    ...(connection.connectionUrls ?? []).map(normalizeAgentUrl)
  ]);
}

function canTryConnectionFallback(endpoint: string, options: RequestInit) {
  const method = String(options.method ?? "GET").toUpperCase();
  if (method === "POST" && endpoint === "/preview/start-server") return true;
  return method === "GET" && (
    endpoint.startsWith("/desktop/browse") ||
    endpoint.startsWith("/desktop/context") ||
    endpoint.startsWith("/desktop/folders") ||
    endpoint.startsWith("/desktop/search") ||
    endpoint.startsWith("/files?") ||
    endpoint.startsWith("/files/read?") ||
    endpoint === "/projects" ||
    endpoint === "/events"
  );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isInvalidDesktopSessionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("missing or invalid desktop token") || message.includes("unauthorized") || message.includes("401");
}

function makeHeaders(options: RequestInit): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined)
  };
}

async function parseResponse<T>(response: Response) {
  const payload = await readPayload(response);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : typeof payload === "string" && payload.trim()
        ? payload.trim()
        : `Vibyra Desktop request failed (${response.status})`;
    throw new DesktopRequestError(message, response.status, new URL(response.url).pathname, payload);
  }
  return payload as T;
}

async function readPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) return await response.json();
    const text = await response.text();
    return text.trim() ? text : {};
  } catch {
    return {};
  }
}
