import { useCallback } from "react";
import { normalizeAgentUrl } from "../utils/network";
import { useAppState } from "./useAppState";

export function useDesktopUrlPromotion(store: ReturnType<typeof useAppState>) {
  const { state, setters } = store;
  return useCallback((resolvedUrl: string) => {
    const activeConnection = state.connection;
    const normalizedUrl = normalizeAgentUrl(resolvedUrl);
    if (!activeConnection || !normalizedUrl || activeConnection.url === normalizedUrl) return;

    const activeUrls = new Set([activeConnection.url, ...(activeConnection.connectionUrls ?? [])].map(normalizeAgentUrl));
    if (!activeUrls.has(normalizedUrl)) return;

    const nextConnection = {
      ...activeConnection,
      url: normalizedUrl,
      connectionUrls: uniqueValues([normalizedUrl, activeConnection.url, ...(activeConnection.connectionUrls ?? [])].map(normalizeAgentUrl))
    };
    setters.setConnection(nextConnection);
    setters.setAgentUrl(normalizedUrl);
    setters.setRememberedDesktops((current) => current.map((desktop) => {
      const desktopUrls = [desktop.url, ...(desktop.connectionUrls ?? [])].map(normalizeAgentUrl);
      if (!desktopUrls.some((url) => activeUrls.has(url))) return desktop;
      return {
        ...desktop,
        url: normalizedUrl,
        connectionUrls: nextConnection.connectionUrls,
        status: "current",
        lastSeenAt: new Date().toISOString()
      };
    }));
  }, [setters, state.connection]);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
