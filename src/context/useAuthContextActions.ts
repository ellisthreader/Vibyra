import { appApiRequest, AuthResponse } from "../utils/appApi";
import { appDeviceName } from "../utils/deviceIdentity";
import { authenticateNativeProvider } from "../utils/nativeAuth";
import { clearPersistedAuthToken, clearPersistedDesktopTokens, clearPersistedSecrets } from "../utils/persistence";
import type { AuthLogs, AuthStore } from "./authActionTypes";
import { createAuthProfileActions } from "./authProfileActions";
import { createAuthRemoteUserActions } from "./authRemoteUserActions";
import { createAuthSessionActions } from "./authSessionActions";

export function useAuthContextActions(store: AuthStore, logs: AuthLogs) {
  const { state, setters } = store;
  const remote = createAuthRemoteUserActions(store);
  const profile = createAuthProfileActions(store, logs);
  const session = createAuthSessionActions(store, logs, remote);

  async function authenticateWith(method: "apple" | "google" | "email", accountStatus?: "existing" | "new") {
    const existing = accountStatus === "existing" || (accountStatus === undefined && state.authMode === "login");
    const referralCode = existing ? "" : state.authReferralCode.trim();
    const providerCredential = method === "email" ? null : await authenticateNativeProvider(method);
    const payload = method === "email"
      ? { email: state.authEmail.trim(), deviceName: appDeviceName(), installId: state.installId,
          name: state.authName.trim(), password: state.authPassword }
      : { deviceName: appDeviceName(), challengeId: providerCredential?.challengeId,
          identityToken: providerCredential?.identityToken, installId: state.installId,
          name: providerCredential?.name || state.authName.trim(), provider: method };
    const result = await appApiRequest<AuthResponse>(
      method === "email" && !existing ? "/api/auth/signup" : "/api/auth/login",
      { method: "POST", body: JSON.stringify(referralCode ? { ...payload, referralCode } : payload) }
    );
    setters.setAuthToken(result.token);
    remote.applyRemoteUser(result.user);
    setters.setAuthenticated(true);
    setters.setAuthPassword("");
    setters.setAuthReferralCode("");
  }

  async function deleteAccount(password?: string) {
    await session.deleteAccount(password);
    await signOut();
  }

  async function signOut() {
    const authToken = state.authToken;
    const revocation = authToken
      ? appApiRequest("/api/auth/logout", { method: "DELETE" }, authToken).catch(() => undefined)
      : Promise.resolve();
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
    resetWorkspaceState(store);
    setters.setDesktopPermissionMode("ask");
    setters.setConnection(null);
    setters.setRememberedDesktops([]);
    let secretsCleared = await clearPersistedSecrets();
    if (!secretsCleared) {
      secretsCleared = await clearPersistedSecrets();
    }
    if (!secretsCleared) {
      logs.appendLog("Logged out, but secure storage cleanup could not be verified. Clear Vibyra app data before another person uses this device.", "Account", "warning");
    }
    await revocation;
  }

  function clearCache() {
    void clearPersistedDesktopTokens();
    setters.setPaired(false);
    setters.setPendingPhoneApproval(null);
    setters.setConnection(null);
    setters.setRememberedDesktops([]);
    resetWorkspaceState(store);
    setters.setSelectedProjectId("");
    setters.setSelectedFileId("empty");
    setters.setBuildState("idle");
    setters.setPreviewState("offline");
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

  return {
    authenticateWith, completeOnboarding: session.completeOnboarding,
    completePcSetup: session.completePcSetup, skipPcSetup: session.skipPcSetup,
    applyRemoteUserFromIap: remote.applyRemoteUser, applyRemoteUsage: remote.applyRemoteUsage,
    clearCache, deleteAccount, expireSession, signOut, updateProfile: profile.updateProfile
  };
}

function resetWorkspaceState({ setters }: AuthStore) {
  setters.setProjects([]);
  setters.setAgents([]);
  setters.setLogs([]);
  setters.setFiles([]);
  setters.setChanges([]);
  setters.setChatThreads({});
  setters.setChatTitles({});
  setters.setDetachedChatThreads({});
  setters.setDetachedChatTitles({});
  setters.setDetachedChatUpdatedAt({});
  setters.setChatProjects({});
  setters.setProjectMemories({});
}
