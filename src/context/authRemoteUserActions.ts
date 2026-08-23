import type { RemoteUser } from "../utils/appApi";
import { normalizePersistedUser } from "../utils/persistence";
import type { AppContextValue } from "./appContextTypes";
import { normalizeAppStateSnapshot } from "./appStatePersistence";
import type { AuthStore } from "./authActionTypes";

export function createAuthRemoteUserActions({ setters }: AuthStore) {
  function applyRemoteUser(user: RemoteUser) {
    const normalized = normalizePersistedUser(user);
    if (!normalized) return;
    setters.setAccountId(normalized.id);
    setters.setAccountPlan(normalized.plan);
    setters.setLevelProgress(normalized.level);
    setters.setAuthName(normalized.name);
    setters.setAuthEmail(normalized.email);
    setters.setCreditsBalance(normalized.creditsBalance);
    setters.setCreditsUsed(normalized.creditsUsed);
    setters.setDailyCreditsUsed(normalized.dailyCreditsUsed);
    setters.setDailyCreditsCap(normalized.dailyCreditsCap);
    setters.setDailyCreditsResetAt(normalized.dailyCreditsResetAt);
    setters.setBurstCreditsUsed(normalized.burstCreditsUsed);
    setters.setBurstCreditsCap(normalized.burstCreditsCap);
    setters.setBurstCreditsResetAt(normalized.burstCreditsResetAt);
    setters.setBurstWindowHours(normalized.burstWindowHours);
    setters.setWeeklyCreditsUsed(normalized.weeklyCreditsUsed);
    setters.setWeeklyCreditsCap(normalized.weeklyCreditsCap);
    setters.setWeeklyCreditsResetAt(normalized.weeklyCreditsResetAt);
    setters.setOnboardingComplete(normalized.onboardingComplete);
    setters.setRememberedDesktops(normalized.rememberedDesktops);
    restoreRemoteAppState(normalized.appState ?? {}, setters);
  }

  function applyRemoteUsage(user: RemoteUser) {
    setters.setAccountPlan(typeof user.plan === "string" && user.plan.trim() ? user.plan : "free");
    setters.setCreditsBalance(user.creditsBalance);
    setters.setCreditsUsed(user.creditsUsed);
    setters.setDailyCreditsUsed(user.dailyCreditsUsed ?? 0);
    setters.setDailyCreditsCap(user.dailyCreditsCap ?? 0);
    setters.setDailyCreditsResetAt(user.dailyCreditsResetAt ?? null);
    setters.setBurstCreditsUsed(user.burstCreditsUsed ?? 0);
    setters.setBurstCreditsCap(user.burstCreditsCap ?? 0);
    setters.setBurstCreditsResetAt(user.burstCreditsResetAt ?? null);
    setters.setBurstWindowHours(user.burstWindowHours ?? 5);
    setters.setWeeklyCreditsUsed(user.weeklyCreditsUsed ?? 0);
    setters.setWeeklyCreditsCap(user.weeklyCreditsCap ?? 0);
    setters.setWeeklyCreditsResetAt(user.weeklyCreditsResetAt ?? null);
    if (user.level) setters.setLevelProgress(user.level);
  }

  return { applyRemoteUser, applyRemoteUsage };
}

function restoreRemoteAppState(raw: Record<string, unknown>, setters: AuthStore["setters"]) {
  const appState = normalizeAppStateSnapshot(raw);
  if (raw.selectedChatModel && appState.selectedChatModel) setters.setSelectedChatModel(appState.selectedChatModel);
  setters.setDesktopPermissionMode("ask");
  const restore = <K extends keyof typeof appState>(key: K, apply: (value: (typeof appState)[K]) => void) => {
    if (raw[key] && typeof raw[key] === "object") apply(appState[key]);
  };
  restore("editApprovals", (value) => setters.setEditApprovals(value as AppContextValue["editApprovals"]));
  restore("chatThreads", (value) => setters.setChatThreads(value as AppContextValue["chatThreads"]));
  restore("chatTitles", (value) => setters.setChatTitles(value as AppContextValue["chatTitles"]));
  restore("detachedChatThreads", (value) => setters.setDetachedChatThreads(value as AppContextValue["detachedChatThreads"]));
  restore("detachedChatTitles", (value) => setters.setDetachedChatTitles(value as AppContextValue["detachedChatTitles"]));
  restore("detachedChatUpdatedAt", (value) => setters.setDetachedChatUpdatedAt(value as AppContextValue["detachedChatUpdatedAt"]));
  restore("projectMemories", (value) => setters.setProjectMemories(value as AppContextValue["projectMemories"]));
  if (raw.chatProjects && typeof raw.chatProjects === "object" && Object.keys(appState.chatProjects).length) {
    const restored = appState.chatProjects as AppContextValue["chatProjects"];
    setters.setChatProjects(restored);
    setters.setProjects((current) => {
      const ids = new Set(current.map((project) => project.id));
      const additions = Object.values(restored).filter((project) => !ids.has(project.id));
      return additions.length ? [...additions, ...current] : current;
    });
  }
}
