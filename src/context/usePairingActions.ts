import * as Haptics from "expo-haptics";
import { LogEvent, RememberedDesktop } from "../types/domain";
import { mergeProjects } from "../utils/files";
import { impact } from "../utils/haptics";
import { getDesktopCandidates, normalizeAgentUrl } from "../utils/network";
import { useAppState } from "./useAppState";
import { mergeRememberedDesktops } from "./pairingHelpers";
import { findDesktopByCode, requestPairAtUrl, waitForDesktopApproval } from "./pairingDiscovery";
import { scanPairByCode, scanPairableDesktops } from "./pairingScans";

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
  pairCode: string;
  projects: State["projects"];
  events: LogEvent[];
};

export function usePairingActions(state: State, setters: Setters, requests: Requests, logs: Logs, files: Files) {
  async function discoverPairableDesktops() {
    setters.setCheckingHealth(true);
    setters.setHealthMessage("Searching this Wi-Fi for Vibyra Desktop...");
    setters.setPairingError("");
    try {
      return await scanPairableDesktops({
        agentUrl: state.agentUrl,
        connectionUrl: state.connection?.url,
        rememberedDesktops: state.rememberedDesktops,
        setHealthMessage: setters.setHealthMessage,
        setRememberedDesktops: setters.setRememberedDesktops
      });
    } finally {
      setters.setCheckingHealth(false);
    }
  }

  async function testDesktopConnection() {
    const code = state.pairCode.trim().toUpperCase();
    if (code.length < 4) {
      setters.setHealthMessage("Enter the Vibyra Desktop code first.");
      return false;
    }

    try {
      await discoverDesktopByCode(code);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Request failed";
      setters.setHealthMessage(`${detail}. Check both devices are on the same Wi-Fi.`);
      return false;
    }
  }

  async function pairMachine() {
    const code = state.pairCode.trim().toUpperCase();
    if (code.length < 4) {
      setters.setPairingError("Enter the code shown in Vibyra Desktop.");
      return;
    }

    setters.setPairing(true);
    setters.setPairingError("");
    setters.setPairingMessage("Finding Vibyra Desktop...");
    setters.setHealthMessage("");

    setters.setCheckingHealth(true);
    try {
      const pair = await scanPairByCode(requests, state.agentUrl, code, setters.setHealthMessage);
      setters.setCheckingHealth(false);
      setters.setPairingMessage("Awaiting approval from PC application");
      const result = pair.result.status === "pending" && pair.result.requestId
        ? await waitForDesktopApproval(requests, pair.result.requestId, pair.url, setters.setPairingMessage)
        : pair.result;
      setters.setPendingPhoneApproval({ url: pair.url, ...result });
      setters.setPairingMessage("Desktop approved. Allow this phone to control your coding machine.");
      impact(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing failed";
      setters.setPairingError(`${message}. Keep Vibyra Desktop open and use the code shown there.`);
      setters.setPairingMessage("Open Vibyra Desktop and type the code shown there.");
    } finally {
      setters.setCheckingHealth(false);
      setters.setPairing(false);
    }
  }

  async function pairMachineAt(url: string, code: string) {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length < 4) {
      setters.setPairingError("Choose a PC or enter the code shown in Vibyra Desktop.");
      return;
    }

    setters.setPairing(true);
    setters.setPairingError("");
    setters.setPairingMessage("Awaiting approval from PC application");
    setters.setHealthMessage("");
    setters.setAgentUrl(url);
    setters.setPairCode(normalizedCode);

    try {
      const pair = await requestPairAtUrl(requests, url, normalizedCode);
      if (pair.type !== "paired") throw new Error(pair.message);
      const result = pair.result.status === "pending" && pair.result.requestId
        ? await waitForDesktopApproval(requests, pair.result.requestId, pair.url, setters.setPairingMessage)
        : pair.result;
      setters.setPendingPhoneApproval({ url: pair.url, ...result });
      setters.setPairingMessage("Desktop approved. Confirm this phone to finish connecting.");
      impact(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing failed";
      setters.setPairingError(`${message}. Keep Vibyra Desktop open and approve the request.`);
    } finally {
      setters.setPairing(false);
    }
  }

  function confirmPhonePermission() {
    if (!state.pendingPhoneApproval) return;
    const result = state.pendingPhoneApproval;
    establishConnection({
      url: result.url,
      token: result.token,
      machineName: result.machineName,
      pairCode: state.pairCode.trim().toUpperCase() || "PAIRED",
      projects: result.projects,
      events: result.events
    });
  }

  async function connectRememberedDesktop(desktop: RememberedDesktop) {
    if (!desktop.token) return false;

    try {
      const result = await requests.desktopRequest<{ projects: State["projects"] }>(
        normalizeAgentUrl(desktop.url),
        "/projects",
        { headers: { Authorization: `Bearer ${desktop.token}` } },
        3000
      );
      establishConnection({
        url: desktop.url,
        token: desktop.token,
        machineName: desktop.machineName,
        pairCode: desktop.pairCode,
        projects: result.projects ?? [],
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

  function establishConnection(result: EstablishedConnection) {
    setters.setConnection({ url: result.url, token: result.token, machineName: result.machineName });
    setters.setMachineName(result.machineName);
    setters.setAgentUrl(result.url);
    setters.setPairCode(result.pairCode);
    setters.setRememberedDesktops(mergeRememberedDesktops(state.rememberedDesktops, [{
      url: result.url,
      machineName: result.machineName,
      pairCode: result.pairCode,
      token: result.token,
      status: "current",
      lastConnectedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    }]));
    setters.setPendingPhoneApproval(null);
    setters.setPaired(true);
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

  async function discoverDesktopByCode(code: string) {
    setters.setCheckingHealth(true);
    setters.setHealthMessage("Searching for Vibyra Desktop on this Wi-Fi...");

    try {
      const candidates = await getDesktopCandidates(state.agentUrl);
      const match = await findDesktopByCode(code, candidates, setters.setHealthMessage);
      if (match) {
        setters.setAgentUrl(match.url);
        setters.setHealthMessage("Found Vibyra Desktop. Waiting for PC approval.");
        return match.url;
      }
      throw new Error("Could not find Vibyra Desktop showing that code");
    } finally {
      setters.setCheckingHealth(false);
    }
  }

  return { confirmPhonePermission, connectRememberedDesktop, discoverPairableDesktops, pairMachine, pairMachineAt, testDesktopConnection };
}
