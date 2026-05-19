import { appApiRequest, AuthResponse, RemoteUser } from "../utils/appApi";
import { normalizePersistedUser } from "../utils/persistence";
import { AppContextValue } from "./appContextTypes";
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
    setters.setOnboardingComplete(normalized.onboardingComplete);
    setters.setRememberedDesktops(normalized.rememberedDesktops);
    const selectedChatModel = normalized.appState?.selectedChatModel;
    if (typeof selectedChatModel === "string" && selectedChatModel) {
      setters.setSelectedChatModel(selectedChatModel);
    }
    if (normalized.appState?.chatThreads && typeof normalized.appState.chatThreads === "object") {
      setters.setChatThreads(normalized.appState.chatThreads as AppContextValue["chatThreads"]);
    }
    if (normalized.appState?.chatTitles && typeof normalized.appState.chatTitles === "object") {
      setters.setChatTitles(normalized.appState.chatTitles as AppContextValue["chatTitles"]);
    }
    if (normalized.appState?.chatProjects && typeof normalized.appState.chatProjects === "object") {
      const restored = normalized.appState.chatProjects as AppContextValue["chatProjects"];
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

  async function authenticateWith(
    method: "apple" | "google" | "microsoft" | "email",
    accountStatus?: "existing" | "new"
  ) {
    const existingAccount = accountStatus === "existing" || (accountStatus === undefined && state.authMode === "login");
    const referralCode = !existingAccount ? state.authReferralCode.trim() : "";
    const payload = method === "email"
      ? { email: state.authEmail.trim(), installId: state.installId, name: state.authName.trim(), password: state.authPassword }
      : { installId: state.installId, name: state.authName.trim() || providerDisplayName(method), provider: method, providerId: state.installId };
    const body = referralCode ? { ...payload, referralCode } : payload;
    const endpoint = method === "email" && !existingAccount ? "/api/auth/signup" : "/api/auth/login";
    const result = await appApiRequest<AuthResponse>(endpoint, { method: "POST", body: JSON.stringify(body) });

    applyAuthenticatedUser(result.token, result.user);
    setters.setAuthenticated(true);
    setters.setAuthPassword("");
    setters.setAuthReferralCode("");
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
    setters.setChatProjects({});
    setters.setConnection(null);
    setters.setRememberedDesktops([]);
    setters.setProjects([]);
    setters.setAgents([]);
    setters.setLogs([]);
    setters.setFiles([]);
    setters.setChanges([]);
  }

  function clearCache() {
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
    setters.setChatProjects({});
    setters.setEditApprovals({});
    setters.setPromptMoney({ total: 0, count: 0, lastEarned: 0, longestPromptLength: 0 });
    logs.appendLog("Cached projects, chats, files, and desktop sessions cleared on this device.", "Profile", "success");
  }

  function expireSession(message = "Your Vibyra login needs refreshing. Log in again to continue.") {
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
    clearCache,
    expireSession,
    signOut,
    updateProfile
  };
}

function providerDisplayName(method: "apple" | "google" | "microsoft" | "email") {
  if (method === "apple") return "Apple User";
  if (method === "google") return "Google User";
  if (method === "microsoft") return "Microsoft User";
  return "Vibyra User";
}
