import * as Haptics from "expo-haptics";
import { PairResponse, Project, LogEvent, RememberedDesktop } from "../types/domain";
import { impact } from "../utils/haptics";
import { wait } from "../utils/ids";
import { appendDesktopCandidates, fetchWithTimeout, getDesktopCandidates } from "../utils/network";
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

type HealthResult = {
  url: string;
  machineName: string;
  pairCode: string;
  connectionUrls: string[];
  ok: boolean;
};

const HEALTH_SCAN_BATCH_SIZE = 32;
const PAIR_SCAN_BATCH_SIZE = 16;
const LAN_HEALTH_TIMEOUT_MS = 900;
const RELAY_HEALTH_TIMEOUT_MS = 1400;
const LAN_PAIR_TIMEOUT_MS = 1800;
const RELAY_PAIR_TIMEOUT_MS = 3500;
const APPROVAL_POLL_MS = 500;
const APPROVAL_TIMEOUT_MS = 90_000;

export function usePairingActions(state: State, setters: Setters, requests: Requests, logs: Logs, files: Files) {
  async function discoverPairableDesktops() {
    const rememberedChecking = state.rememberedDesktops.map((desktop) => ({
      ...desktop,
      status: state.connection?.url === desktop.url ? "current" : "checking"
    }) satisfies RememberedDesktop);
    if (rememberedChecking.length > 0) setters.setRememberedDesktops(rememberedChecking);

    const candidates = appendDesktopCandidates(
      await getDesktopCandidates(state.agentUrl),
      state.rememberedDesktops.flatMap((desktop) => [desktop.url])
    );
    let found: RememberedDesktop[] = rememberedChecking;
    let checked = 0;

    setters.setCheckingHealth(true);
    setters.setHealthMessage("Searching this Wi-Fi for Vibyra Desktop...");
    setters.setPairingError("");

    try {
      for (let index = 0; index < candidates.length; index += HEALTH_SCAN_BATCH_SIZE) {
        const group = candidates.slice(index, index + HEALTH_SCAN_BATCH_SIZE);
        const results = await Promise.all(group.map((url) => checkHealth(url)));
        const online = results
          .filter((item): item is HealthResult => Boolean(item?.ok && item.pairCode))
          .map((result) => healthToDesktop(result, state.connection?.url === result.url ? "current" : "online"));

        if (online.length > 0) {
          found = mergeRememberedDesktops(found, online);
          setters.setRememberedDesktops(found);
        }

        checked += group.length;
        setters.setHealthMessage(`Searching this Wi-Fi... ${Math.min(checked, candidates.length)}/${candidates.length}`);
      }

      found = found.map((desktop) => desktop.status === "checking" ? { ...desktop, status: "offline" } : desktop);
      setters.setRememberedDesktops(found);
      setters.setHealthMessage(found.length > 0 ? `Found ${found.length} Vibyra Desktop app${found.length === 1 ? "" : "s"}.` : "No Vibyra Desktop app found. Check Vibyra Desktop is open and your firewall allows local connections.");
      return found;
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

    try {
      const pair = await requestPairByCode(code);
      setters.setPairingMessage("Awaiting approval from PC application");
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
      const pair = await requestPairAtUrl(url, normalizedCode);
      if (pair.type !== "paired") throw new Error(pair.message);
      const result = pair.result.status === "pending" && pair.result.requestId
        ? await waitForDesktopApproval(pair.result.requestId, pair.url)
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
    setters.setConnection({ url: result.url, token: result.token, machineName: result.machineName });
    setters.setMachineName(result.machineName);
    setters.setAgentUrl(result.url);
    setters.setRememberedDesktops(mergeRememberedDesktops(state.rememberedDesktops, [{
      url: result.url,
      machineName: result.machineName,
      pairCode: state.pairCode.trim().toUpperCase() || "PAIRED",
      status: "current",
      lastConnectedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    }]));
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
    let candidates = await getDesktopCandidates(state.agentUrl);
    const wrongCodeUrls: string[] = [];
    let checked = 0;
    setters.setCheckingHealth(true);
    setters.setHealthMessage("Finding Vibyra Desktop...");

    try {
      const healthMatch = await findDesktopByCode(code, candidates);
      if (healthMatch) {
        const directPair = await requestPairAtUrl(healthMatch.url, code);
        if (directPair.type === "paired") return directPair;
        candidates = appendDesktopCandidates(candidates, [healthMatch.url, ...healthMatch.connectionUrls]);
      }

      for (let index = 0; index < candidates.length; index += PAIR_SCAN_BATCH_SIZE) {
        const group = candidates.slice(index, index + PAIR_SCAN_BATCH_SIZE);
        const results = group.map((url) => requestPairAtUrl(url, code));
        const paired = await firstMatching(results, (result) => result.type === "paired");
        if (paired?.type === "paired") return paired;
        const settledResults = await Promise.all(results);

        wrongCodeUrls.push(...settledResults
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
    const candidates = await getDesktopCandidates(state.agentUrl);
    const match = await findDesktopByCode(code, candidates);
    if (match) {
      setters.setAgentUrl(match.url);
      setters.setHealthMessage("Found Vibyra Desktop. Waiting for PC approval.");
      return match.url;
    }

    throw new Error("Could not find Vibyra Desktop showing that code");
  }

  async function findDesktopByCode(code: string, candidates: string[]) {
    let checked = 0;
    for (let index = 0; index < candidates.length; index += HEALTH_SCAN_BATCH_SIZE) {
      const group = candidates.slice(index, index + HEALTH_SCAN_BATCH_SIZE);
      const match = await firstMatching(
        group.map((url) => checkHealth(url, code)),
        (result): result is HealthResult => Boolean(result?.ok && result.pairCode === code)
      );
      if (match) return match;
      checked += group.length;
      setters.setHealthMessage(`Searching for Vibyra Desktop... ${Math.min(checked, candidates.length)}/${candidates.length}`);
    }
    return null;
  }

  async function checkHealth(url: string, code?: string): Promise<HealthResult | null> {
    try {
      const response = await fetchWithTimeout(`${url}/health`, {}, url.startsWith("https://") ? RELAY_HEALTH_TIMEOUT_MS : LAN_HEALTH_TIMEOUT_MS);
      if (!response.ok) return null;
      const payload = await response.json();
      const pairCode = String(payload?.pairCode ?? "").toUpperCase();
      const connectionUrls = Array.isArray(payload?.connectionUrls)
        ? payload.connectionUrls.map((item: unknown) => String(item))
        : [];
      return {
        url,
        machineName: String(payload?.machineName ?? ""),
        pairCode,
        connectionUrls,
        ok: Boolean(payload?.ok) && (!code || pairCode === code)
      };
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
        url.startsWith("https://") ? RELAY_PAIR_TIMEOUT_MS : LAN_PAIR_TIMEOUT_MS
      );
      return { type: "paired" as const, url, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      return { type: "failed" as const, url, message };
    }
  }

  async function waitForDesktopApproval(requestId: string, desktopUrl: string) {
    const maxAttempts = Math.ceil(APPROVAL_TIMEOUT_MS / APPROVAL_POLL_MS);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await wait(APPROVAL_POLL_MS);
      setters.setPairingMessage("Awaiting approval from PC application");
      const result = await requests.desktopRequest<ApprovalResult>(desktopUrl, `/pair/status?requestId=${encodeURIComponent(requestId)}`);
      if (result.status === "approved") return result;
      if (result.status === "denied") throw new Error("Desktop denied pairing.");
    }
    throw new Error("Pairing timed out. Try the code again.");
  }

  return { confirmPhonePermission, discoverPairableDesktops, pairMachine, pairMachineAt, testDesktopConnection };
}

function desktopKey(machineName: string, pairCode: string) {
  return `${machineName || "Vibyra Desktop"}:${pairCode}`;
}

function healthToDesktop(result: HealthResult, status: RememberedDesktop["status"]): RememberedDesktop {
  return {
    url: result.url,
    machineName: result.machineName || "Vibyra Desktop",
    pairCode: result.pairCode,
    status,
    lastSeenAt: new Date().toISOString()
  };
}

function mergeRememberedDesktops(current: RememberedDesktop[], updates: RememberedDesktop[]) {
  const merged = [...current];
  updates.forEach((update) => {
    const index = merged.findIndex((desktop) => desktop.url === update.url || desktopKey(desktop.machineName, desktop.pairCode) === desktopKey(update.machineName, update.pairCode));
    if (index >= 0) {
      merged[index] = { ...merged[index], ...update };
    } else {
      merged.push(update);
    }
  });
  return merged
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .slice(0, 8);
}

function statusRank(status: RememberedDesktop["status"]) {
  if (status === "current") return 0;
  if (status === "online") return 1;
  if (status === "checking") return 2;
  return 3;
}

function firstMatching<T, M extends T>(promises: Array<Promise<T>>, matches: (value: T) => value is M): Promise<M | null>;
function firstMatching<T>(promises: Array<Promise<T>>, matches: (value: T) => boolean): Promise<T | null>;
function firstMatching<T>(promises: Array<Promise<T>>, matches: (value: T) => boolean) {
  if (promises.length === 0) return Promise.resolve(null);

  return new Promise<T | null>((resolve) => {
    let settled = 0;
    let resolved = false;

    promises.forEach((promise) => {
      promise
        .then((value) => {
          if (!resolved && matches(value)) {
            resolved = true;
            resolve(value);
          }
        })
        .catch(() => {
          // Individual connection probes are expected to fail while scanning a LAN.
        })
        .finally(() => {
          settled += 1;
          if (!resolved && settled === promises.length) {
            resolve(null);
          }
        });
    });
  });
}

type ApprovalResult = {
  status: "pending" | "approved" | "denied";
  token: string;
  machineName: string;
  projects: Project[];
  events: LogEvent[];
};
