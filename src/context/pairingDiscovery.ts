import { PairResponse } from "../types/domain";
import { makePairRequestId, trustedDesktopUrl, trustedDesktopUrls } from "../utils/desktopUrls";
import { appDeviceName } from "../utils/deviceIdentity";
import { fetchWithTimeout } from "../utils/network";
import { wait } from "../utils/ids";
import {
  APPROVAL_POLL_MS,
  APPROVAL_TIMEOUT_MS,
  ApprovalResult,
  HealthResult,
  HEALTH_SCAN_BATCH_SIZE,
  LAN_APPROVAL_STATUS_TIMEOUT_MS,
  LAN_HEALTH_TIMEOUT_MS,
  LAN_PAIR_TIMEOUT_MS,
  RELAY_APPROVAL_STATUS_TIMEOUT_MS,
  RELAY_HEALTH_TIMEOUT_MS,
  RELAY_PAIR_TIMEOUT_MS,
  firstMatching
} from "./pairingHelpers";

type Requests = {
  desktopRequest: <T>(baseUrl: string, endpoint: string, options?: RequestInit, timeoutMs?: number) => Promise<T>;
};

export async function checkHealth(url: string, code?: string): Promise<HealthResult | null> {
  const trustedUrl = trustedDesktopUrl(url);
  if (!trustedUrl) return null;
  try {
    const response = await fetchWithTimeout(`${trustedUrl}/health`, {}, trustedUrl.startsWith("https://") ? RELAY_HEALTH_TIMEOUT_MS : LAN_HEALTH_TIMEOUT_MS);
    if (!response.ok) return null;
    const payload = await response.json();
    const pairCode = String(payload?.pairCode ?? "").toUpperCase();
    const connectionUrls = trustedDesktopUrls(Array.isArray(payload?.connectionUrls)
      ? payload.connectionUrls.map((item: unknown) => String(item))
      : []);
    return {
      url: trustedUrl,
      machineName: String(payload?.machineName ?? ""),
      pairCode: pairCode || undefined,
      connectionUrls,
      desktopAccountReady: typeof payload?.desktopAccountReady === "boolean" ? payload.desktopAccountReady : undefined,
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

export async function requestPairAtUrl(
  requests: Requests,
  url: string,
  code: string,
  requestId = makePairRequestId(),
  accountId?: number | null
) {
  const trustedUrl = trustedDesktopUrl(url);
  if (!trustedUrl) return { type: "failed" as const, url, message: "Desktop URL is not trusted" };
  try {
    const normalizedCode = code.trim().toUpperCase();
    const result = await requests.desktopRequest<PairResponse>(
      trustedUrl,
      "/pair",
      {
        method: "POST",
        body: JSON.stringify({
          deviceName: appDeviceName(),
          requestId,
          ...(accountId ? { accountId } : {}),
          ...(normalizedCode ? { code: normalizedCode } : { autoPair: true })
        })
      },
      trustedUrl.startsWith("https://") ? RELAY_PAIR_TIMEOUT_MS : LAN_PAIR_TIMEOUT_MS
    );
    return { type: "paired" as const, url: trustedUrl, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return { type: "failed" as const, url, message };
  }
}

export async function waitForDesktopApproval(
  requests: Requests,
  requestId: string,
  desktopUrl: string,
  setStatus: (message: string) => void,
  desktopUrls: string[] = []
) {
  const urls = trustedDesktopUrls([desktopUrl, ...desktopUrls]);
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  let lastStatusError = "";
  while (Date.now() < deadline) {
    await wait(APPROVAL_POLL_MS);
    setStatus("Awaiting approval from PC application");
    let foundStatusRoute = false;
    let missingRequestCount = 0;

    for (const url of urls) {
      try {
        const result = await requests.desktopRequest<ApprovalResult>(
          url,
          `/pair/status?requestId=${encodeURIComponent(requestId)}`,
          {},
          url.startsWith("https://") ? RELAY_APPROVAL_STATUS_TIMEOUT_MS : LAN_APPROVAL_STATUS_TIMEOUT_MS
        );
        foundStatusRoute = true;
        if (result.status === "approved" && result.token) return { ...result, projects: result.projects ?? [], events: result.events ?? [] };
        if (result.status === "denied") throw new Error("Desktop denied pairing.");
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Pairing status check failed";
        if (message.toLowerCase().includes("denied")) throw new Error("Desktop denied pairing.");
        if (message.toLowerCase().includes("not found")) missingRequestCount += 1;
        lastStatusError = message;
      }
    }

    if (urls.length > 0 && missingRequestCount === urls.length) {
      throw new Error("Desktop lost the pairing request. Try the code again.");
    }
    if (!foundStatusRoute && lastStatusError) setStatus(`Waiting for PC approval. Last check: ${lastStatusError}`);
  }
  throw new Error(lastStatusError ? `Pairing timed out while checking PC approval: ${lastStatusError}` : "Pairing timed out. Try the code again.");
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
