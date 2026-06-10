import { getAppApiUrl } from "../../utils/appApi";

export function formatAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not sign in. Try again.";
  if (!message.toLowerCase().includes("could not reach vibyra")) return message;

  return `The login API at ${getAppApiUrl()} is not reachable from this app. If the backend is already running, update EXPO_PUBLIC_API_URL to this computer's current Wi-Fi/LAN IP and restart Expo.`;
}
