import { RememberedDesktop } from "../types/domain";
import { LevelProgress } from "./appApiTypes";
import { readStorageItem, writeStorageItem } from "./nativeStorage";
import { normalizeLevelProgress } from "./persistenceLevel";

const SESSION_KEY = "vibyra.session.v1";

export type PersistedSession = {
  authToken: string;
  installId: string;
  onboardingComplete: boolean;
  pcSetupComplete: boolean;
  selectedChatModel: string;
  rememberedDesktops: RememberedDesktop[];
  user: PersistedUser | null;
};

export type PersistedUser = {
  id: number;
  name: string;
  email: string;
  plan: string;
  planBillingCycle: "monthly" | "annual";
  planRenewsAt: string | null;
  creditsBalance: number;
  creditsUsed: number;
  dailyCreditsUsed: number;
  dailyCreditsCap: number;
  monthlyCredits: number;
  allowedModelTiers: string[];
  level?: LevelProgress;
  onboardingComplete: boolean;
  rememberedDesktops: RememberedDesktop[];
  appState?: Record<string, unknown>;
};

export function createEmptyPersistedSession(): PersistedSession {
  return {
    authToken: "",
    installId: makeInstallId(),
    onboardingComplete: false,
    pcSetupComplete: false,
    selectedChatModel: "gpt-5.4-mini",
    rememberedDesktops: [],
    user: null
  };
}

export async function loadPersistedSession(): Promise<PersistedSession> {
  try {
    const raw = await readStorageItem(SESSION_KEY);
    return raw ? parsePersistedSession(raw) : createEmptyPersistedSession();
  } catch {
    return createEmptyPersistedSession();
  }
}

export async function savePersistedSession(session: PersistedSession) {
  try {
    await writeStorageItem(SESSION_KEY, JSON.stringify({
      authToken: session.authToken,
      installId: session.installId,
      onboardingComplete: session.onboardingComplete,
      pcSetupComplete: session.pcSetupComplete,
      selectedChatModel: session.selectedChatModel,
      rememberedDesktops: normalizeDesktops(session.rememberedDesktops),
      user: normalizeUser(session.user)
    }));
  } catch {
    // Persistence is a convenience layer; the app should still run if storage is unavailable.
  }
}

export function normalizePersistedUser(value: unknown): PersistedUser | null {
  return normalizeUser(value);
}

function parsePersistedSession(raw: string): PersistedSession {
  const parsed = JSON.parse(raw) as Partial<PersistedSession>;
  const user = normalizeUser(parsed.user);
  return {
    authToken: String(parsed.authToken ?? ""),
    installId: String(parsed.installId ?? "") || makeInstallId(),
    onboardingComplete: Boolean(user?.onboardingComplete ?? parsed.onboardingComplete),
    pcSetupComplete: Boolean(parsed.pcSetupComplete),
    selectedChatModel: String(parsed.selectedChatModel ?? "gpt-5.4-mini"),
    rememberedDesktops: user?.rememberedDesktops ?? normalizeDesktops(parsed.rememberedDesktops),
    user
  };
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
        connectionUrls: normalizeDesktopUrls(desktop.connectionUrls),
        token: desktop.token ? String(desktop.token) : undefined,
        machineName: String(desktop.machineName ?? "Vibyra Desktop"),
        status: normalizeStatus(desktop.status),
        lastSeenAt: desktop.lastSeenAt,
        lastConnectedAt: desktop.lastConnectedAt
      };
    })
    .filter((item): item is RememberedDesktop => Boolean(item))
    .slice(0, 8);
}

function normalizeDesktopUrls(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const urls = Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
  return urls.length > 0 ? urls : undefined;
}

function normalizeStatus(status: unknown): RememberedDesktop["status"] {
  if (status === "current") return "online";
  if (status === "online" || status === "checking" || status === "offline") return status;
  return "offline";
}

function normalizeUser(value: unknown): PersistedUser | null {
  if (!value || typeof value !== "object") return null;
  const user = value as Partial<PersistedUser>;
  const id = Number(user.id);
  const email = String(user.email ?? "");
  if (!Number.isFinite(id) || !email) return null;

  const cycleRaw = String(user.planBillingCycle ?? "monthly");
  const planBillingCycle: "monthly" | "annual" = cycleRaw === "annual" ? "annual" : "monthly";
  const tiersRaw = (user as { allowedModelTiers?: unknown }).allowedModelTiers;
  const allowedModelTiers = Array.isArray(tiersRaw)
    ? tiersRaw.filter((t): t is string => typeof t === "string")
    : ["free", "budget"];

  return {
    id,
    name: String(user.name ?? "Vibyra User"),
    email,
    plan: String(user.plan ?? "free"),
    planBillingCycle,
    planRenewsAt: typeof user.planRenewsAt === "string" ? user.planRenewsAt : null,
    creditsBalance: normalizeNumber(user.creditsBalance, 0),
    creditsUsed: normalizeNumber(user.creditsUsed, 0),
    dailyCreditsUsed: normalizeNumber((user as { dailyCreditsUsed?: unknown }).dailyCreditsUsed, 0),
    dailyCreditsCap: normalizeNumber((user as { dailyCreditsCap?: unknown }).dailyCreditsCap, 0),
    monthlyCredits: normalizeNumber((user as { monthlyCredits?: unknown }).monthlyCredits, 0),
    allowedModelTiers,
    level: normalizeLevelProgress((user as { level?: unknown }).level),
    onboardingComplete: Boolean(user.onboardingComplete),
    rememberedDesktops: normalizeDesktops(user.rememberedDesktops),
    appState: user.appState && typeof user.appState === "object" ? user.appState : {}
  };
}

function normalizeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function makeInstallId() {
  return `install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
