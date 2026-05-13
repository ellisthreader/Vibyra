import { LogEvent, Project, RememberedDesktop } from "../types/domain";

export const HEALTH_SCAN_BATCH_SIZE = 48;
export const PAIR_SCAN_BATCH_SIZE = 48;
export const LAN_HEALTH_TIMEOUT_MS = 600;
export const RELAY_HEALTH_TIMEOUT_MS = 1400;
export const LAN_PAIR_TIMEOUT_MS = 900;
export const RELAY_PAIR_TIMEOUT_MS = 3500;
export const APPROVAL_POLL_MS = 500;
export const APPROVAL_TIMEOUT_MS = 90_000;
export const DISCOVERY_SCAN_TIMEOUT_MS = 90_000;

export type HealthResult = {
  url: string;
  machineName: string;
  pairCode?: string;
  connectionUrls: string[];
  ok: boolean;
};

export type ApprovalResult = {
  status: "pending" | "approved" | "denied";
  token: string;
  machineName: string;
  projects: Project[];
  events: LogEvent[];
};

export function healthToDesktop(result: HealthResult, status: RememberedDesktop["status"]): RememberedDesktop {
  return {
    url: result.url,
    machineName: result.machineName || "Vibyra Desktop",
    pairCode: result.pairCode ?? "",
    connectionUrls: desktopConnectionUrls(result.url, result.connectionUrls),
    status,
    lastSeenAt: new Date().toISOString()
  };
}

export function mergeRememberedDesktops(current: RememberedDesktop[], updates: RememberedDesktop[]) {
  const merged = [...current];
  updates.forEach((update) => {
    const index = merged.findIndex((desktop) => sameUrlDesktop(desktop, update) || samePairCodeDesktop(desktop, update));
    if (index >= 0) {
      merged[index] = mergeDesktop(merged[index], update);
    } else {
      merged.push(update);
    }
  });
  return merged
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .slice(0, 8);
}

export function desktopConnectionUrls(url: string, connectionUrls: string[] = []) {
  return uniqueValues([url, ...connectionUrls]);
}

function mergeDesktop(current: RememberedDesktop, update: RememberedDesktop): RememberedDesktop {
  return {
    ...current,
    ...withoutUndefined(update),
    connectionUrls: desktopConnectionUrls(update.url || current.url, [
      current.url,
      ...(current.connectionUrls ?? []),
      ...(update.connectionUrls ?? [])
    ])
  };
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function samePairCodeDesktop(a: RememberedDesktop, b: RememberedDesktop) {
  return Boolean(a.pairCode && b.pairCode && desktopKey(a.machineName, a.pairCode) === desktopKey(b.machineName, b.pairCode));
}

function sameUrlDesktop(a: RememberedDesktop, b: RememberedDesktop) {
  const aUrls = new Set([a.url, ...(a.connectionUrls ?? [])]);
  return [b.url, ...(b.connectionUrls ?? [])].some((url) => aUrls.has(url));
}

function desktopKey(machineName: string, pairCode: string) {
  return `${machineName || "Vibyra Desktop"}:${pairCode}`;
}

function statusRank(status: RememberedDesktop["status"]) {
  if (status === "current") return 0;
  if (status === "online") return 1;
  if (status === "checking") return 2;
  return 3;
}

export function firstMatching<T, M extends T>(promises: Array<Promise<T>>, matches: (value: T) => value is M): Promise<M | null>;
export function firstMatching<T>(promises: Array<Promise<T>>, matches: (value: T) => boolean): Promise<T | null>;
export function firstMatching<T>(promises: Array<Promise<T>>, matches: (value: T) => boolean) {
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
