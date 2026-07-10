import { appApiRequest, AuthResponse, RemoteUser } from "../utils/appApi";
import { appDeviceName } from "../utils/deviceIdentity";
import {
  clearPersistedAuthToken,
  clearPersistedDesktopTokens,
  clearPersistedSecrets,
  normalizePersistedUser
} from "../utils/persistence";
import { authenticateNativeProvider } from "../utils/nativeAuth";
import { AppContextValue } from "./appContextTypes";
import { normalizeAppStateSnapshot } from "./appStatePersistence";
import { useAppState } from "./useAppState";

type Store = ReturnType<typeof useAppState>;
type Logs = {
  appendLog: (message: string, source?: string, tone?: "info" | "success" | "warning" | "error") => void;
};

export function useAuthContextActions(store: Store, logs: Logs) {
  const { state, setters } = store;

  function applyAuthenticatedUser(token: string, user: RemoteUser) {
    setters.setAuthToken(token);
    applyRemoteUser(user);
  }

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
    const rawAppState = normalized.appState ?? {};
    const appState = normalizeAppStateSnapshot(rawAppState);
    const selectedChatModel = rawAppState.selectedChatModel ? appState.selectedChatModel : "";
    if (typeof selectedChatModel === "string" && selectedChatModel) {
      setters.setSelectedChatModel(selectedChatModel);
    }
    setters.setDesktopPermissionMode("ask");
    if (rawAppState.editApprovals && typeof rawAppState.editApprovals === "object") {
      setters.setEditApprovals(appState.editApprovals as AppContextValue["editApprovals"]);
    }
    if (rawAppState.chatThreads && typeof rawAppState.chatThreads === "object") {
      setters.setChatThreads(appState.chatThreads as AppContextValue["chatThreads"]);
    }
    if (rawAppState.chatTitles && typeof rawAppState.chatTitles === "object") {
      setters.setChatTitles(appState.chatTitles as AppContextValue["chatTitles"]);
    }
    if (rawAppState.detachedChatThreads && typeof rawAppState.detachedChatThreads === "object") {
      setters.setDetachedChatThreads(appState.detachedChatThreads as AppContextValue["detachedChatThreads"]);
    }
    if (rawAppState.detachedChatTitles && typeof rawAppState.detachedChatTitles === "object") {
      setters.setDetachedChatTitles(appState.detachedChatTitles as AppContextValue["detachedChatTitles"]);
    }
    if (rawAppState.detachedChatUpdatedAt && typeof rawAppState.detachedChatUpdatedAt === "object") {
      setters.setDetachedChatUpdatedAt(appState.detachedChatUpdatedAt as AppContextValue["detachedChatUpdatedAt"]);
    }
    if (rawAppState.projectMemories && typeof rawAppState.projectMemories === "object") {
      setters.setProjectMemories(appState.projectMemories as AppContextValue["projectMemories"]);
    }
    if (rawAppState.chatProjects && typeof rawAppState.chatProjects === "object" && Object.keys(appState.chatProjects).length > 0) {
      const restored = appState.chatProjects as AppContextValue["chatProjects"];
      setters.setChatProjects(restored);
      const restoredList = Object.values(restored);
      if (restoredList.length > 0) {
        setters.setProjects((current) => {
          const ids = new Set(current.map((p) => p.id));
          const additions = restoredList.filter((p) => !ids.has(p.id));
          return additions.length > 0 ? [...additions, ...current] : current;
        });
      }
    }
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

  async function authenticateWith(
    method: "apple" | "google" | "email",
    accountStatus?: "existing" | "new"
  ) {
    const existingAccount = accountStatus === "existing" || (accountStatus === undefined && state.authMode === "login");
    const referralCode = !existingAccount ? state.authReferralCode.trim() : "";
    const providerCredential = method === "email" ? null : await authenticateNativeProvider(method);
    const payload = method === "email"
      ? { email: state.authEmail.trim(), deviceName: appDeviceName(), installId: state.installId, name: state.authName.trim(), password: state.authPassword }
      : {
          deviceName: appDeviceName(),
          challengeId: providerCredential?.challengeId,
          identityToken: providerCredential?.identityToken,
          installId: state.installId,
          name: providerCredential?.name || state.authName.trim(),
          provider: method
        };
    const body = referralCode ? { ...payload, referralCode } : payload;
    const endpoint = method === "email" && !existingAccount ? "/api/auth/signup" : "/api/auth/login";
    const result = await appApiRequest<AuthResponse>(endpoint, { method: "POST", body: JSON.stringify(body) });

    applyAuthenticatedUser(result.token, result.user);
    setters.setAuthenticated(true);
    setters.setAuthPassword("");
    setters.setAuthReferralCode("");
  }

  async function deleteAccount(password?: string) {
    if (!state.authToken) throw new Error("Log in again before deleting your account.");
    const session = await appApiRequest<{ user: RemoteUser }>("/api/session", {}, state.authToken);
    const provider = session.user.provider ?? "email";
    const credential = provider === "email" ? null : await authenticateNativeProvider(provider);
    await appApiRequest("/api/account", {
      method: "DELETE",
      body: JSON.stringify(provider === "email"
        ? { password: password ?? "" }
        : { challengeId: credential?.challengeId, identityToken: credential?.identityToken })
    }, state.authToken);
    signOut();
  }

  function completeOnboarding() {
    setters.setOnboardingComplete(true);
    if (!state.authToken) return;
    appApiRequest("/api/onboarding/complete", { method: "POST" }, state.authToken)
      .then((result) => {
        const response = result as { user?: RemoteUser };
        if (response.user) applyRemoteUser(response.user);
      })
      .catch(() => {
        logs.appendLog("Onboarding saved locally and will sync later.", "Account", "warning");
      });
  }

  function completePcSetup() {
    setters.setPcSetupComplete(true);
    setters.setPcSetupSkipped(false);
  }

  function skipPcSetup() {
    setters.setPcSetupComplete(true);
    setters.setPcSetupSkipped(true);
  }

  function signOut() {
    void clearPersistedSecrets();
    setters.setAuthenticated(false);
    setters.setAuthToken("");
    setters.setAccountId(null);
    setters.setAuthPassword("");
    setters.setOnboardingComplete(false);
    setters.setPcSetupComplete(false);
    setters.setPcSetupSkipped(false);
    setters.setPaired(false);
    setters.setPendingPhoneApproval(null);
    setters.setPairing(false);
    setters.setPairingError("");
    setters.setPairingMessage("");
    setters.setAgentUrl("");
    setters.setPairCode("");
    setters.setHealthMessage("");
    setters.setCheckingHealth(false);
    setters.setChatThreads({});
    setters.setChatTitles({});
    setters.setDetachedChatThreads({});
    setters.setDetachedChatTitles({});
    setters.setDetachedChatUpdatedAt({});
    setters.setChatProjects({});
    setters.setProjectMemories({});
    setters.setDesktopPermissionMode("ask");
    setters.setConnection(null);
    setters.setRememberedDesktops([]);
    setters.setProjects([]);
    setters.setAgents([]);
    setters.setLogs([]);
    setters.setFiles([]);
    setters.setChanges([]);
  }

  function clearCache() {
    void clearPersistedDesktopTokens();
    setters.setPaired(false);
    setters.setPendingPhoneApproval(null);
    setters.setConnection(null);
    setters.setRememberedDesktops([]);
    setters.setProjects([]);
    setters.setSelectedProjectId("");
    setters.setAgents([]);
    setters.setLogs([]);
    setters.setFiles([]);
    setters.setChanges([]);
    setters.setSelectedFileId("empty");
    setters.setBuildState("idle");
    setters.setPreviewState("offline");
    setters.setChatThreads({});
    setters.setChatTitles({});
    setters.setDetachedChatThreads({});
    setters.setDetachedChatTitles({});
    setters.setDetachedChatUpdatedAt({});
    setters.setChatProjects({});
    setters.setProjectMemories({});
    setters.setEditApprovals({});
    setters.setDesktopPermissionMode("ask");
    setters.setPromptMoney({ total: 0, count: 0, lastEarned: 0, longestPromptLength: 0 });
    logs.appendLog("Cached projects, chats, files, and desktop sessions cleared on this device.", "Profile", "success");
  }

  function expireSession(message = "Your Vibyra login needs refreshing. Log in again to continue.") {
    void clearPersistedAuthToken();
    setters.setAuthenticated(false);
    setters.setAuthToken("");
    setters.setAccountId(null);
    setters.setAuthMode("login");
    setters.setAuthPassword("");
    logs.appendLog(message, "Account", "warning");
  }

  function updateProfile(changes: { name?: string; email?: string; machineName?: string; profileImageUri?: string }) {
    if (typeof changes.name === "string") setters.setAuthName(changes.name);
    if (typeof changes.email === "string") setters.setAuthEmail(changes.email);
    if (typeof changes.machineName === "string") setters.setMachineName(changes.machineName);
    if (typeof changes.profileImageUri === "string") setters.setProfileImageUri(changes.profileImageUri);
    if (!state.authToken) return;
    if (changes.name === undefined && changes.email === undefined) return;
    appApiRequest("/api/account/profile", {
      method: "POST",
      body: JSON.stringify({ name: changes.name ?? state.authName, email: changes.email ?? state.authEmail })
    }, state.authToken).catch(() => {
      logs.appendLog("Profile saved locally and will sync later.", "Account", "warning");
    });
  }

  return {
    authenticateWith,
    completeOnboarding,
    completePcSetup,
    skipPcSetup,
    applyRemoteUserFromIap: applyRemoteUser,
    applyRemoteUsage,
    clearCache,
    deleteAccount,
    expireSession,
    signOut,
    updateProfile
  };
}
