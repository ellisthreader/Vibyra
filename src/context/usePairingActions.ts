import * as Haptics from "expo-haptics";
import { PairResponse, Project, LogEvent } from "../types/domain";
import { impact } from "../utils/haptics";
import { wait } from "../utils/ids";
import { fetchWithTimeout, getDesktopCandidates } from "../utils/network";
import { useAppState } from "./useAppState";

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

    try {
      const pair = await requestPairByCode(code);
      setters.setPairingMessage("Asking Vibyra Desktop for permission...");
      const result = pair.result.status === "pending" && pair.result.requestId
        ? await waitForDesktopApproval(pair.result.requestId, pair.url)
        : pair.result;
      setters.setPendingPhoneApproval({ url: pair.url, ...result });
      setters.setPairingMessage("Desktop approved. Allow this phone to control your coding machine.");
      impact(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing failed";
      setters.setPairingError(`${message}. Keep Vibyra Desktop open and use the code shown there.`);
      setters.setPairingMessage("Open Vibyra Desktop and type the code shown there.");
    } finally {
      setters.setPairing(false);
    }
  }

  function confirmPhonePermission() {
    if (!state.pendingPhoneApproval) return;
    const result = state.pendingPhoneApproval;
    setters.setConnection({ url: result.url, token: result.token, machineName: result.machineName });
    setters.setMachineName(result.machineName);
    setters.setAgentUrl(result.url);
    setters.setPendingPhoneApproval(null);
    setters.setPaired(true);
    logs.appendLog(`Secure session established with ${result.machineName}`, "Pairing", "success");
    impact(Haptics.ImpactFeedbackStyle.Medium);

    if (result.projects.length > 0) {
      setters.setProjects(result.projects);
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
      return await scanDesktopCandidates(code, "health");
    } finally {
      setters.setCheckingHealth(false);
    }
  }

  async function requestPairByCode(code: string) {
    const candidates = getDesktopCandidates(state.agentUrl);
    const wrongCodeUrls: string[] = [];
    let checked = 0;
    setters.setCheckingHealth(true);
    setters.setHealthMessage("Finding Vibyra Desktop...");

    try {
      for (let index = 0; index < candidates.length; index += 8) {
        const group = candidates.slice(index, index + 8);
        const results = await Promise.all(group.map((url) => requestPairAtUrl(url, code)));
        const paired = results.find((result) => result.type === "paired");
        if (paired?.type === "paired") return paired;

        wrongCodeUrls.push(...results
          .filter((result) => result.type === "failed" && result.message.includes("Pair code does not match"))
          .map((result) => result.url));
        checked += group.length;
        setters.setHealthMessage(`Finding Vibyra Desktop... ${Math.min(checked, candidates.length)}/${candidates.length}`);
      }
    } finally {
      setters.setCheckingHealth(false);
    }

    if (wrongCodeUrls.length > 0) throw new Error("Found Vibyra Desktop, but the code did not match");
    throw new Error("Could not reach Vibyra Desktop");
  }

  async function scanDesktopCandidates(code: string, mode: "health") {
    const candidates = getDesktopCandidates(state.agentUrl);
    let checked = 0;
    for (let index = 0; index < candidates.length; index += 14) {
      const group = candidates.slice(index, index + 14);
      const results = await Promise.all(group.map((url) => checkHealth(url, code)));
      const match = results.find((result) => result?.ok && result.pairCode === code);
      if (match) {
        setters.setAgentUrl(match.url);
        setters.setHealthMessage("Found Vibyra Desktop. Waiting for PC approval.");
        return match.url;
      }
      checked += group.length;
      setters.setHealthMessage(`Searching for Vibyra Desktop... ${Math.min(checked, candidates.length)}/${candidates.length}`);
    }
    throw new Error("Could not find Vibyra Desktop showing that code");
  }

  async function checkHealth(url: string, code: string) {
    try {
      const response = await fetchWithTimeout(`${url}/health`, {}, url.startsWith("https://") ? 5000 : 850);
      const payload = await response.json();
      return { url, pairCode: String(payload?.pairCode ?? "").toUpperCase(), ok: Boolean(payload?.ok) };
    } catch {
      return null;
    }
  }

  async function requestPairAtUrl(url: string, code: string) {
    try {
      const result = await requests.desktopRequest<PairResponse>(
        url,
        "/pair",
        { method: "POST", body: JSON.stringify({ code, deviceName: "Vibyra Phone" }) },
        url.startsWith("https://") ? 8000 : 1600
      );
      return { type: "paired" as const, url, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      return { type: "failed" as const, url, message };
    }
  }

  async function waitForDesktopApproval(requestId: string, desktopUrl: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await wait(1000);
      setters.setPairingMessage("Waiting for you to press Allow on the desktop...");
      const result = await requests.desktopRequest<ApprovalResult>(desktopUrl, `/pair/status?requestId=${encodeURIComponent(requestId)}`);
      if (result.status === "approved") return result;
      if (result.status === "denied") throw new Error("Desktop denied pairing.");
    }
    throw new Error("Pairing timed out. Try the code again.");
  }

  return { confirmPhonePermission, pairMachine, testDesktopConnection };
}

type ApprovalResult = {
  status: "pending" | "approved" | "denied";
  token: string;
  machineName: string;
  projects: Project[];
  events: LogEvent[];
};
