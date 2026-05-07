import { LogEvent, Project, RememberedDesktop } from "../types/domain";

export const HEALTH_SCAN_BATCH_SIZE = 32;
export const PAIR_SCAN_BATCH_SIZE = 16;
export const LAN_HEALTH_TIMEOUT_MS = 900;
export const RELAY_HEALTH_TIMEOUT_MS = 1400;
export const LAN_PAIR_TIMEOUT_MS = 1800;
export const RELAY_PAIR_TIMEOUT_MS = 3500;
export const APPROVAL_POLL_MS = 500;
export const APPROVAL_TIMEOUT_MS = 90_000;

export type HealthResult = {
  url: string;
  machineName: string;
  pairCode: string;
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
    pairCode: result.pairCode,
    status,
    lastSeenAt: new Date().toISOString()
  };
}

export function mergeRememberedDesktops(current: RememberedDesktop[], updates: RememberedDesktop[]) {
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
