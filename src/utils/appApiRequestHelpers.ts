export function requestTimeoutFor(endpoint: string) {
  if (endpoint === "/api/chat") return 240000;
  if (endpoint === "/api/chat/research-plan") return 25000;
  if (endpoint === "/api/community/assets/generate") return 100000;
  if (endpoint === "/api/projects/publish") return 120000;
  if (endpoint === "/api/community/projects") return 5000;
  return 15000;
}

export function buildAppApiHeaders(input: RequestInit["headers"], token?: string) {
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

  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function readAppApiJson<T>(response: Response): Promise<T | Record<string, never>> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text } as T;
  }
}
