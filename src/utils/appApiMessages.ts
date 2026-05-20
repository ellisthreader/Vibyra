export function getBackendReachabilityMessage(url: string, reason: string, timedOut = false) {
  const prefix = timedOut
    ? `Could not reach Vibyra (timed out at ${url}).`
    : `Could not reach Vibyra at ${url}. ${reason}.`;
  return `${prefix} If the backend is already running, Expo is probably using the wrong API address. Set EXPO_PUBLIC_API_URL in .env to this computer's active Wi-Fi/LAN URL, then restart Expo. If nothing is listening on port 8000, start Vibyra with npm start.`;
}

export function getBackendStreamTimeoutMessage(url: string, timeoutMs: number) {
  const minutes = Math.max(1, Math.round(timeoutMs / 60000));
  return `Vibyra AI chat timed out after ${minutes} minutes while waiting for ${url}. Deep Research can take longer than normal chat; try a narrower question or retry.`;
}
