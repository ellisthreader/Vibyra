import { fetchWithTimeout } from "./network";

const CHAT_PREFLIGHT_TIMEOUT_MS = 3500;

export async function assertBackendReachableBeforeChat(
  apiUrl: string,
  onOnline: () => void,
  onOffline: () => void
) {
  const url = `${apiUrl}/api/skills`;
  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, CHAT_PREFLIGHT_TIMEOUT_MS);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    onOnline();
  } catch (error) {
    onOffline();
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Could not reach Vibyra at ${url} before starting AI chat. ${reason}. Start the backend with npm run backend or npm run dev; if it is already running, check EXPO_PUBLIC_API_URL in .env and restart Expo.`);
  }
}
