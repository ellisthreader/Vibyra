import { fetchWithTimeout } from "./network";
import { getBackendReachabilityMessage } from "./appApiMessages";

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
    throw new Error(getBackendReachabilityMessage(url, reason));
  }
}
