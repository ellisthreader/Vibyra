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

    const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, { ...options, headers });
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
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "Vibyra Desktop request failed");
  }
  return payload as T;
}
