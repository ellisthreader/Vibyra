import { PairResponse } from "../types/domain";
import { fetchWithTimeout } from "../utils/network";
import { wait } from "../utils/ids";
import {
  APPROVAL_POLL_MS,
  APPROVAL_TIMEOUT_MS,
  ApprovalResult,
  HealthResult,
  HEALTH_SCAN_BATCH_SIZE,
  LAN_HEALTH_TIMEOUT_MS,
  LAN_PAIR_TIMEOUT_MS,
  RELAY_HEALTH_TIMEOUT_MS,
  RELAY_PAIR_TIMEOUT_MS,
  firstMatching
} from "./pairingHelpers";

type Requests = {
  desktopRequest: <T>(baseUrl: string, endpoint: string, options?: RequestInit, timeoutMs?: number) => Promise<T>;
};

export async function checkHealth(url: string, code?: string): Promise<HealthResult | null> {
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

export async function findDesktopByCode(
  code: string,
  candidates: string[],
  setStatus: (message: string) => void
) {
  let checked = 0;
  for (let index = 0; index < candidates.length; index += HEALTH_SCAN_BATCH_SIZE) {
    const group = candidates.slice(index, index + HEALTH_SCAN_BATCH_SIZE);
    const match = await firstMatching(
      group.map((url) => checkHealth(url, code)),
      (result): result is HealthResult => Boolean(result?.ok && result.pairCode === code)
    );
    if (match) return match;
    checked += group.length;
    setStatus(`Searching for Vibyra Desktop... ${Math.min(checked, candidates.length)}/${candidates.length}`);
  }
  return null;
}

export async function requestPairAtUrl(requests: Requests, url: string, code: string) {
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

export async function waitForDesktopApproval(
  requests: Requests,
  requestId: string,
  desktopUrl: string,
  setStatus: (message: string) => void
) {
  const maxAttempts = Math.ceil(APPROVAL_TIMEOUT_MS / APPROVAL_POLL_MS);
  let lastStatusError = "";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await wait(APPROVAL_POLL_MS);
    setStatus("Awaiting approval from PC application");
    try {
      const result = await requests.desktopRequest<ApprovalResult>(desktopUrl, `/pair/status?requestId=${encodeURIComponent(requestId)}`);
      if (result.status === "approved") return result;
      if (result.status === "denied") throw new Error("Desktop denied pairing.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing status check failed";
      if (message.toLowerCase().includes("denied")) throw new Error("Desktop denied pairing.");
      if (message.toLowerCase().includes("not found")) throw new Error("Desktop lost the pairing request. Try the code again.");
      lastStatusError = message;
      setStatus(`Waiting for PC approval. Last check: ${message}`);
    }
  }
  throw new Error(lastStatusError ? `Pairing timed out while checking PC approval: ${lastStatusError}` : "Pairing timed out. Try the code again.");
}
