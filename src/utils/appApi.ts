import { Platform } from "react-native";
import { fetchWithTimeout, getExpoHost, normalizeAgentUrl } from "./network";

export type RemoteUser = {
  id: number;
  name: string;
  email: string;
  plan: string;
  creditsBalance: number;
  creditsUsed: number;
  onboardingComplete: boolean;
  rememberedDesktops: unknown[];
  appState?: Record<string, unknown>;
};

export type AuthResponse = {
  ok: boolean;
  token: string;
  user: RemoteUser;
};

export type SessionResponse = {
  ok: boolean;
  user: RemoteUser;
};

export type ChatResponse = {
  ok: boolean;
  reply: string;
  app?: { id: string; title: string; html: string } | null;
  title?: string;
  model: string;
  creditCost: number;
  creditsBalance: number;
  creditsUsed: number;
  user?: RemoteUser;
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export function getAppApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return normalizeAgentUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  const host = getExpoHost();
  if (host && Platform.OS !== "web") {
    return `http://${host}:8000`;
  }

  return "http://127.0.0.1:8000";
}

export async function appApiRequest<T>(endpoint: string, options: RequestInit = {}, token?: string) {
  const headers = buildHeaders(options.headers, token);
  const url = `${getAppApiUrl()}${endpoint}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...options,
      headers
    }, endpoint === "/api/chat" ? 70000 : 15000);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    const aborted = reason.toLowerCase().includes("abort");
    throw new Error(aborted
      ? `Could not reach Vibyra (timed out at ${url}). Check the backend is running and EXPO_PUBLIC_API_URL is set to your dev machine's LAN IP.`
      : `Could not reach Vibyra at ${url}. ${reason}. Set EXPO_PUBLIC_API_URL in .env to your dev machine's LAN IP and restart Expo.`);
  }

  const data = await readJson<ApiErrorPayload | T>(response);

  if (!response.ok) {
    const errorPayload = data as ApiErrorPayload;
    throw new Error(errorPayload.error || errorPayload.message || `Request failed with ${response.status}`);
  }

  return data as T;
}

function buildHeaders(input: RequestInit["headers"], token?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  if (input instanceof Headers) {
    input.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(input)) {
    input.forEach(([key, value]) => {
      headers[key] = value;
    });
  } else if (input) {
    Object.entries(input).forEach(([key, value]) => {
      headers[key] = String(value);
    });
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function readJson<T>(response: Response): Promise<T | Record<string, never>> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text } as T;
  }
}
