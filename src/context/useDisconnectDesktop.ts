import { useCallback } from "react";
import type { AgentConnection, RememberedDesktop } from "../types/domain";
import { fetchWithTimeout, normalizeAgentUrl } from "../utils/network";
import { useAppState } from "./useAppState";
import { useLogActions } from "./useLogActions";

type DisconnectOptions = {
  clearRememberedToken?: boolean;
  healthMessage?: string;
  logMessage?: string;
  notifyDesktop?: boolean;
  rememberedStatus?: RememberedDesktop["status"];
};

export function useDisconnectDesktop(
  store: ReturnType<typeof useAppState>,
  logs: ReturnType<typeof useLogActions>
) {
  const { state, setters } = store;
  return useCallback((options: DisconnectOptions = {}) => {
    const activeConnection = state.connection;
    const clearRememberedToken = Boolean(options.clearRememberedToken);
    if (activeConnection && options.notifyDesktop !== false && !clearRememberedToken) {
      void notifyDesktopDisconnect(activeConnection);
    }
    setters.setConnection(null);
    setters.setPaired(false);
    setters.setPendingPhoneApproval(null);
    setters.setPairing(false);
    setters.setPairingError("");
    setters.setPairingMessage("Open Vibyra Desktop and type the code shown there.");
    setters.setHealthMessage(options.healthMessage ?? "Disconnected from Vibyra Desktop.");
    setters.setPreviewState("offline");
    setters.setFiles([]);
    setters.setSelectedFileId("empty");
    setters.setRememberedDesktops((current) => current.map((desktop) => {
      const activeUrls = new Set([activeConnection?.url, ...(activeConnection?.connectionUrls ?? [])].filter(Boolean));
      const desktopUrls = [desktop.url, ...(desktop.connectionUrls ?? [])].filter(Boolean);
      const matchesActive = desktop.status === "current" || desktopUrls.some((url) => activeUrls.has(url));
      if (!matchesActive) return desktop;
      const status = options.rememberedStatus ?? (clearRememberedToken ? "offline" as const : "online" as const);
      const next = { ...desktop, status };
      if (clearRememberedToken) delete next.token;
      return next;
    }));
    logs.appendLog(options.logMessage ?? "Phone disconnected from Vibyra Desktop.", "Desktop", "warning");
  }, [logs, setters, state.connection]);
}

async function notifyDesktopDisconnect(connection: AgentConnection) {
  const urls = Array.from(new Set(
    [connection.url, ...(connection.connectionUrls ?? [])].map(normalizeAgentUrl).filter(Boolean)
  ));
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(`${url}/desktop/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" }
      }, 1200);
      if (response.ok) return;
    } catch {
      // Try the next known desktop URL.
    }
  }
}
