import { RememberedDesktop } from "../types/domain";
import { appendDesktopCandidates, getDesktopCandidates } from "../utils/network";
import { makePairRequestId } from "../utils/desktopUrls";
import {
  desktopConnectionUrls,
  DISCOVERY_SCAN_TIMEOUT_MS,
  HEALTH_SCAN_BATCH_SIZE,
  HealthResult,
  PAIR_SCAN_BATCH_SIZE,
  firstMatching,
  healthToDesktop,
  mergeRememberedDesktops
} from "./pairingHelpers";
import { checkHealth, requestPairAtUrl } from "./pairingDiscovery";

type Requests = {
  desktopRequest: <T>(baseUrl: string, endpoint: string, options?: RequestInit, timeoutMs?: number) => Promise<T>;
};

type ScanContext = {
  agentUrl: string;
  connectionUrl: string | undefined;
  rememberedDesktops: RememberedDesktop[];
  setHealthMessage: (message: string) => void;
  setRememberedDesktops: (desktops: RememberedDesktop[]) => void;
};

export async function scanPairableDesktops(ctx: ScanContext) {
  const deadline = Date.now() + DISCOVERY_SCAN_TIMEOUT_MS;
  const currentDesktopUrl = (desktop: RememberedDesktop) => Boolean(
    ctx.connectionUrl && [desktop.url, ...(desktop.connectionUrls ?? [])].includes(ctx.connectionUrl)
  );
  const rememberedChecking = ctx.rememberedDesktops.map((desktop) => ({
    ...desktop,
    status: currentDesktopUrl(desktop) ? "current" : "checking"
  }) satisfies RememberedDesktop);
  if (rememberedChecking.length > 0) ctx.setRememberedDesktops(rememberedChecking);

  const candidates = appendDesktopCandidates(
    await getDesktopCandidates(ctx.agentUrl),
    ctx.rememberedDesktops.flatMap((desktop) => [desktop.url, ...(desktop.connectionUrls ?? [])])
  );
  let found: RememberedDesktop[] = rememberedChecking;
  let checked = 0;
  let timedOut = false;

  for (let index = 0; index < candidates.length; index += HEALTH_SCAN_BATCH_SIZE) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    const group = candidates.slice(index, index + HEALTH_SCAN_BATCH_SIZE);
    const results = await Promise.all(group.map((url) => checkHealth(url)));
    const online = results
      .filter((item): item is HealthResult => Boolean(item?.ok))
      .map((result) => healthToDesktop(
        result,
        ctx.connectionUrl && [result.url, ...result.connectionUrls].includes(ctx.connectionUrl) ? "current" : "online"
      ));

    if (online.length > 0) {
      found = mergeRememberedDesktops(found, online);
      ctx.setRememberedDesktops(found);
    }

    checked += group.length;
    ctx.setHealthMessage(`Searching this Wi-Fi... ${Math.min(checked, candidates.length)}/${candidates.length}`);
  }

  found = found.map((desktop) => desktop.status === "checking" ? { ...desktop, status: "offline" } : desktop);
  ctx.setRememberedDesktops(found);
  const reachable = found.filter((desktop) => desktop.status === "online" || desktop.status === "current");
  ctx.setHealthMessage(reachable.length > 0
    ? `Found ${reachable.length} reachable Vibyra Desktop app${reachable.length === 1 ? "" : "s"}.`
    : timedOut
      ? "PC appears offline. Could not find Vibyra Desktop after about 90 seconds. Check it is open, awake, and on the same Wi-Fi."
      : "PC appears offline. No reachable Vibyra Desktop app found on this Wi-Fi. Check Vibyra Desktop is open and your firewall allows local connections.");
  return found;
}

export async function scanPairByCode(
  requests: Requests,
  agentUrl: string,
  code: string,
  setHealthMessage: (message: string) => void,
  rememberedDesktops: RememberedDesktop[] = [],
  accountId?: number | null
) {
  const deadline = Date.now() + DISCOVERY_SCAN_TIMEOUT_MS;
  const candidates = appendDesktopCandidates(
    await getDesktopCandidates(agentUrl),
    rememberedDesktops.flatMap((desktop) => [desktop.url, ...(desktop.connectionUrls ?? [])])
  );
  const wrongCodeUrls: string[] = [];
  const requestId = makePairRequestId();
  let checked = 0;
  let timedOut = false;
  setHealthMessage("Finding Vibyra Desktop...");

  for (let index = 0; index < candidates.length; index += PAIR_SCAN_BATCH_SIZE) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    const group = candidates.slice(index, index + PAIR_SCAN_BATCH_SIZE);
    const results = group.map((url) => requestPairAtUrl(requests, url, code, requestId, accountId));
    const paired = await firstMatching(results, (result) => result.type === "paired");
    if (paired?.type === "paired") {
      const health = await checkHealth(paired.url, code);
      const connectionUrls = desktopConnectionUrls(paired.url, health?.connectionUrls ?? []);
      return { ...paired, connectionUrls };
    }
    const settledResults = await Promise.all(results);

    wrongCodeUrls.push(...settledResults
      .filter((result) => result.type === "failed" && result.message.includes("Pair code does not match"))
      .map((result) => result.url));
    checked += group.length;
    setHealthMessage(`Finding Vibyra Desktop... ${Math.min(checked, candidates.length)}/${candidates.length}`);
  }

  if (wrongCodeUrls.length > 0) throw new Error("Found Vibyra Desktop, but the code did not match");
  throw new Error(timedOut
    ? "PC appears offline. Could not find Vibyra Desktop after about 90 seconds"
    : "PC appears offline. Could not reach Vibyra Desktop");
}
