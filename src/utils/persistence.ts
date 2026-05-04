import { RememberedDesktop } from "../types/domain";

const SESSION_KEY = "vibyra.session.v1";

export type PersistedSession = {
  onboardingComplete: boolean;
  rememberedDesktops: RememberedDesktop[];
};

const emptySession: PersistedSession = {
  onboardingComplete: false,
  rememberedDesktops: []
};

export function loadPersistedSession(): PersistedSession {
  try {
    const storage = getStorage();
    if (!storage) return emptySession;
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return emptySession;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    return {
      onboardingComplete: Boolean(parsed.onboardingComplete),
      rememberedDesktops: normalizeDesktops(parsed.rememberedDesktops)
    };
  } catch {
    return emptySession;
  }
}

export function savePersistedSession(session: PersistedSession) {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(SESSION_KEY, JSON.stringify({
      onboardingComplete: session.onboardingComplete,
      rememberedDesktops: normalizeDesktops(session.rememberedDesktops)
    }));
  } catch {
    // Persistence is a convenience layer; the app should still run if storage is unavailable.
  }
}

function getStorage() {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

function normalizeDesktops(value: unknown): RememberedDesktop[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item): RememberedDesktop | null => {
      const desktop = item as Partial<RememberedDesktop>;
      const url = String(desktop.url ?? "").trim();
      const pairCode = String(desktop.pairCode ?? "").trim().toUpperCase();
      if (!url || !pairCode) return null;
      const key = `${url}:${pairCode}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        url,
        pairCode,
        machineName: String(desktop.machineName ?? "Vibyra Desktop"),
        status: normalizeStatus(desktop.status),
        lastSeenAt: desktop.lastSeenAt,
        lastConnectedAt: desktop.lastConnectedAt
      };
    })
    .filter((item): item is RememberedDesktop => Boolean(item))
    .slice(0, 8);
}

function normalizeStatus(status: unknown): RememberedDesktop["status"] {
  if (status === "current") return "online";
  if (status === "online" || status === "checking" || status === "offline") return status;
  return "offline";
}
