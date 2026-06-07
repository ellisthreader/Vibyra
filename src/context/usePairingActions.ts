import * as Haptics from "expo-haptics";
import { LogEvent } from "../types/domain";
import { impact } from "../utils/haptics";
import { getDesktopCandidates } from "../utils/network";
import { useAppState } from "./useAppState";
import { findDesktopByCode, waitForDesktopApproval } from "./pairingDiscovery";
import { scanPairByCode, scanPairableDesktops } from "./pairingScans";
import { usePairingConnectionActions } from "./usePairingConnectionActions";

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

export function usePairingActions(state: State, setters: Setters, requests: Requests, logs: Logs, files: Files) {
  const connectionActions = usePairingConnectionActions(state, setters, requests, logs, files);

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
    if (!state.accountId) {
      setters.setPairingError("Log in to Vibyra on this phone before pairing Desktop.");
      return false;
    }

    const code = state.pairCode.trim().toUpperCase();
    if (code.length < 4) {
      setters.setPairingError("Enter the code shown in Vibyra Desktop.");
      return false;
    }

    setters.setPairing(true);
    setters.setPairingError("");
    setters.setPairingMessage("Finding Vibyra Desktop...");
    setters.setHealthMessage("");

    setters.setCheckingHealth(true);
    try {
      const pair = await scanPairByCode(requests, state.agentUrl, code, setters.setHealthMessage, state.rememberedDesktops, state.accountId);
      setters.setCheckingHealth(false);
      setters.setPairingMessage("Awaiting approval from PC application");
      const result = pair.result.status === "pending" && pair.result.requestId
        ? await waitForDesktopApproval(requests, pair.result.requestId, pair.url, setters.setPairingMessage, pair.connectionUrls)
        : pair.result;
      if (!result.token) throw new Error("Desktop did not return a secure session token");
      setters.setPendingPhoneApproval({
        url: pair.url,
        connectionUrls: "connectionUrls" in pair ? pair.connectionUrls : undefined,
        token: result.token,
        machineName: result.machineName,
        projects: result.projects ?? [],
        events: result.events ?? []
      });
      setters.setPairingMessage("Desktop approved. Allow this phone to control your coding machine.");
      impact(Haptics.ImpactFeedbackStyle.Medium);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing failed";
      setters.setPairingError(pairingErrorMessage(message, "code"));
      setters.setPairingMessage("Open Vibyra Desktop and type the code shown there.");
      return false;
    } finally {
      setters.setCheckingHealth(false);
      setters.setPairing(false);
    }
  }

  async function pairMachineAt(url: string, code: string) {
    if (!state.accountId) {
      setters.setPairingError("Log in to Vibyra on this phone before pairing Desktop.");
      return false;
    }

    const normalizedCode = code.trim().toUpperCase();

    setters.setPairing(true);
    setters.setPairingError("");
    setters.setPairingMessage("Awaiting approval from PC application");
    setters.setHealthMessage("");
    setters.setAgentUrl(url);
    setters.setPairCode(normalizedCode);

    try {
      const pair = await connectionActions.requestPairAtReachableUrl(url, normalizedCode);
      if (pair.type !== "paired") throw new Error(pair.message);
      const result = pair.result.status === "pending" && pair.result.requestId
        ? await waitForDesktopApproval(requests, pair.result.requestId, pair.url, setters.setPairingMessage, pair.connectionUrls)
        : pair.result;
      if (!result.token) throw new Error("Desktop did not return a secure session token");
      setters.setPendingPhoneApproval({
        url: pair.url,
        connectionUrls: pair.connectionUrls,
        token: result.token,
        machineName: result.machineName,
        projects: result.projects ?? [],
        events: result.events ?? []
      });
      setters.setPairingMessage("Desktop approved. Confirm this phone to finish connecting.");
      impact(Haptics.ImpactFeedbackStyle.Medium);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing failed";
      setters.setPairingError(pairingErrorMessage(message, "approval"));
      return false;
    } finally {
      setters.setPairing(false);
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

  return {
    confirmPhonePermission: connectionActions.confirmPhonePermission,
    connectRememberedDesktop: connectionActions.connectRememberedDesktop,
    discoverPairableDesktops,
    pairMachine,
    pairMachineAt,
    testDesktopConnection
  };
}

function pairingErrorMessage(message: string, recovery: "code" | "approval") {
  if (isDesktopAccountError(message)) return message;
  const hint = recovery === "code"
    ? "Keep Vibyra Desktop open and use the code shown there."
    : "Keep Vibyra Desktop open and approve the request.";
  return `${message}. ${hint}`;
}

function isDesktopAccountError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("log in to vibyra desktop")
    || normalized.includes("different vibyra account")
    || normalized.includes("phone account identity");
}
