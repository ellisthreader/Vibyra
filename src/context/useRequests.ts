import { AgentConnection } from "../types/domain";
import { fetchWithTimeout, normalizeAgentUrl } from "../utils/network";

type RequestConfig = {
  agentUrl: string;
  connection: AgentConnection | null;
};

export function useRequests({ agentUrl, connection }: RequestConfig) {
  async function desktopRequest<T>(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = 5000
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
    const baseUrl = normalizeAgentUrl(connection?.url ?? agentUrl);
    const headers = makeHeaders(options);
    if (useAuth && connection?.token) {
      headers.Authorization = `Bearer ${connection.token}`;
    }

    const timeoutMs = endpoint === "/agents/start" ? 190000 : endpoint === "/commands/run" ? 25000 : 5000;
    const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, { ...options, headers }, timeoutMs);
    return parseResponse<T>(response);
  }

  return { agentRequest, desktopRequest };
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
    throw new Error(message);
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
