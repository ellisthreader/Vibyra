import { RememberedDesktop } from "../types/domain";
import { appendDesktopCandidates, getDesktopCandidates } from "../utils/network";
import {
  HEALTH_SCAN_BATCH_SIZE,
  HealthResult,
  PAIR_SCAN_BATCH_SIZE,
  firstMatching,
  healthToDesktop,
  mergeRememberedDesktops
} from "./pairingHelpers";
import { checkHealth, findDesktopByCode, requestPairAtUrl } from "./pairingDiscovery";

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
  const rememberedChecking = ctx.rememberedDesktops.map((desktop) => ({
    ...desktop,
    status: ctx.connectionUrl === desktop.url ? "current" : "checking"
  }) satisfies RememberedDesktop);
  if (rememberedChecking.length > 0) ctx.setRememberedDesktops(rememberedChecking);

  const candidates = appendDesktopCandidates(
    await getDesktopCandidates(ctx.agentUrl),
    ctx.rememberedDesktops.flatMap((desktop) => [desktop.url])
  );
  let found: RememberedDesktop[] = rememberedChecking;
  let checked = 0;

  for (let index = 0; index < candidates.length; index += HEALTH_SCAN_BATCH_SIZE) {
    const group = candidates.slice(index, index + HEALTH_SCAN_BATCH_SIZE);
    const results = await Promise.all(group.map((url) => checkHealth(url)));
    const online = results
      .filter((item): item is HealthResult => Boolean(item?.ok && item.pairCode))
      .map((result) => healthToDesktop(result, ctx.connectionUrl === result.url ? "current" : "online"));

    if (online.length > 0) {
      found = mergeRememberedDesktops(found, online);
      ctx.setRememberedDesktops(found);
    }

    checked += group.length;
    ctx.setHealthMessage(`Searching this Wi-Fi... ${Math.min(checked, candidates.length)}/${candidates.length}`);
  }

  found = found.map((desktop) => desktop.status === "checking" ? { ...desktop, status: "offline" } : desktop);
  ctx.setRememberedDesktops(found);
  ctx.setHealthMessage(found.length > 0 ? `Found ${found.length} Vibyra Desktop app${found.length === 1 ? "" : "s"}.` : "No Vibyra Desktop app found. Check Vibyra Desktop is open and your firewall allows local connections.");
  return found;
}

export async function scanPairByCode(
  requests: Requests,
  agentUrl: string,
  code: string,
  setHealthMessage: (message: string) => void
) {
  let candidates = await getDesktopCandidates(agentUrl);
  const wrongCodeUrls: string[] = [];
  let checked = 0;
  setHealthMessage("Finding Vibyra Desktop...");

  const healthMatch = await findDesktopByCode(code, candidates, setHealthMessage);
  if (healthMatch) {
    const directPair = await requestPairAtUrl(requests, healthMatch.url, code);
    if (directPair.type === "paired") return directPair;
    candidates = appendDesktopCandidates(candidates, [healthMatch.url, ...healthMatch.connectionUrls]);
  }

  for (let index = 0; index < candidates.length; index += PAIR_SCAN_BATCH_SIZE) {
    const group = candidates.slice(index, index + PAIR_SCAN_BATCH_SIZE);
    const results = group.map((url) => requestPairAtUrl(requests, url, code));
    const paired = await firstMatching(results, (result) => result.type === "paired");
    if (paired?.type === "paired") return paired;
    const settledResults = await Promise.all(results);

    wrongCodeUrls.push(...settledResults
      .filter((result) => result.type === "failed" && result.message.includes("Pair code does not match"))
      .map((result) => result.url));
    checked += group.length;
    setHealthMessage(`Finding Vibyra Desktop... ${Math.min(checked, candidates.length)}/${candidates.length}`);
  }

  if (wrongCodeUrls.length > 0) throw new Error("Found Vibyra Desktop, but the code did not match");
  throw new Error("Could not reach Vibyra Desktop");
}
