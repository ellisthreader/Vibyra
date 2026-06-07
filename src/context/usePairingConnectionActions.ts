import * as Haptics from "expo-haptics";
import { LogEvent, RememberedDesktop } from "../types/domain";
import { mergeProjects } from "../utils/files";
import { impact } from "../utils/haptics";
import { normalizeAgentUrl } from "../utils/network";
import { useAppState } from "./useAppState";
import { desktopConnectionUrls, mergeRememberedDesktops } from "./pairingHelpers";
import { checkHealth, requestPairAtUrl } from "./pairingDiscovery";

type State = ReturnType<typeof useAppState>["state"];
type Setters = ReturnType<typeof useAppState>["setters"];
type Requests = {
  desktopRequest: <T>(baseUrl: string, endpoint: string, options?: RequestInit, timeoutMs?: number) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
};
type Files = {
  loadProjectFilesWithConnection: (url: string, token: string, projectId: string) => Promise<void>;
};
type EstablishedConnection = {
  url: string;
  token: string;
  machineName: string;
  connectionUrls?: string[];
  pairCode: string;
  projects: State["projects"];
  events: LogEvent[];
};

export function usePairingConnectionActions(
  state: State,
  setters: Setters,
  requests: Requests,
  logs: Logs,
  files: Files
) {
  function confirmPhonePermission() {
    if (!state.pendingPhoneApproval) return;
    const result = state.pendingPhoneApproval;
    establishConnection({
      url: result.url,
      token: result.token,
      machineName: result.machineName,
      connectionUrls: result.connectionUrls,
      pairCode: state.pairCode.trim().toUpperCase() || "PAIRED",
      projects: result.projects,
      events: result.events
    });
  }

  async function connectRememberedDesktop(desktop: RememberedDesktop) {
    if (!desktop.token) return false;

    try {
      const connected = await requestProjectsFromRememberedDesktop(desktop);
      if (connected === "invalid-token") {
        setters.setRememberedDesktops((current) => clearRememberedDesktopToken(current, desktop));
        setters.setPairingMessage("This desktop session expired. Reconnect with the code shown on Vibyra Desktop.");
        return false;
      }
      if (!connected) throw new Error("Desktop is offline");
      establishConnection({
        url: connected.url,
        token: desktop.token,
        machineName: desktop.machineName,
        connectionUrls: desktopConnectionUrls(connected.url, desktop.connectionUrls),
        pairCode: desktop.pairCode,
        projects: connected.projects,
        events: []
      });
      setters.setPairingError("");
      setters.setPairingMessage(`Reconnected to ${desktop.machineName}.`);
      return true;
    } catch {
      setters.setRememberedDesktops(mergeRememberedDesktops(state.rememberedDesktops, [{ ...desktop, status: "offline" }]));
      return false;
    }
  }

  async function requestPairAtReachableUrl(url: string, code: string) {
    const knownDesktop = state.rememberedDesktops.find((desktop) => desktop.url === url || Boolean(code) && desktop.pairCode === code);
    const health = await checkHealth(url, code);
    if (health && health.desktopAccountReady === false) {
      return { type: "failed" as const, url, message: "Log in to Vibyra Desktop with the same account as your phone." };
    }
    const urls = desktopConnectionUrls(url, [
      ...(knownDesktop?.connectionUrls ?? []),
      ...(health?.connectionUrls ?? [])
    ]);
    let lastFailure = { type: "failed" as const, url, message: "Could not reach Vibyra Desktop" };
    const requestId = `phone-pair-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    for (const candidateUrl of urls) {
      const pair = await requestPairAtUrl(requests, candidateUrl, code, requestId, state.accountId);
      if (pair.type === "paired") return { ...pair, connectionUrls: urls };
      lastFailure = pair;
    }

    return lastFailure;
  }

  function establishConnection(result: EstablishedConnection) {
    const connectionUrls = desktopConnectionUrls(result.url, result.connectionUrls);
    setters.setConnection({ url: result.url, token: result.token, machineName: result.machineName, connectionUrls });
    setters.setMachineName(result.machineName);
    setters.setAgentUrl(result.url);
    setters.setPairCode(result.pairCode);
    setters.setRememberedDesktops(mergeRememberedDesktops(state.rememberedDesktops, [{
      url: result.url,
      machineName: result.machineName,
      pairCode: result.pairCode,
      token: result.token,
      connectionUrls,
      status: "current",
      lastConnectedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    }]));
    setters.setPendingPhoneApproval(null);
    setters.setPaired(true);
    setters.setPcSetupSkipped(false);
    logs.appendLog(`Secure session established with ${result.machineName}`, "Pairing", "success");
    impact(Haptics.ImpactFeedbackStyle.Medium);

    if (result.projects.length > 0) {
      setters.setProjects((current) => mergeProjects(current, result.projects));
      setters.setSelectedProjectId(result.projects[0].id);
      void files.loadProjectFilesWithConnection(result.url, result.token, result.projects[0].id);
    }
    if (result.events.length > 0) {
      setters.setLogs(result.events);
    }
  }

  async function requestProjectsFromRememberedDesktop(desktop: RememberedDesktop) {
    const urls = desktopConnectionUrls(desktop.url, desktop.connectionUrls);
    for (const url of urls) {
      try {
        const result = await requests.desktopRequest<{ projects: State["projects"] }>(
          normalizeAgentUrl(url),
          "/projects",
          { headers: { Authorization: `Bearer ${desktop.token}` } },
          3000
        );
        return { url, projects: result.projects ?? [] };
      } catch (error) {
        if (isInvalidDesktopToken(error)) return "invalid-token" as const;
      }
    }
    return null;
  }

  return { confirmPhonePermission, connectRememberedDesktop, requestPairAtReachableUrl };
}

function isInvalidDesktopToken(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("missing or invalid desktop token") || message.includes("unauthorized") || message.includes("401");
}

function clearRememberedDesktopToken(desktops: RememberedDesktop[], target: RememberedDesktop) {
  const targetUrls = new Set([target.url, ...(target.connectionUrls ?? [])].map(normalizeAgentUrl));
  return desktops.map((desktop) => {
    const desktopUrls = [desktop.url, ...(desktop.connectionUrls ?? [])].map(normalizeAgentUrl);
    const matchesTarget = desktopUrls.some((url) => targetUrls.has(url)) || (
      desktop.machineName === target.machineName && desktop.pairCode === target.pairCode
    );
    if (!matchesTarget) return desktop;
    const { token: _token, ...rest } = desktop;
    return { ...rest, status: "online" as const };
  });
}
