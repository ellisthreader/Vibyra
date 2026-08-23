import { appApiRequest, RemoteUser } from "../utils/appApi";
import { authenticateNativeProvider } from "../utils/nativeAuth";
import type { AuthLogs, AuthStore } from "./authActionTypes";
import type { createAuthRemoteUserActions } from "./authRemoteUserActions";

type RemoteActions = ReturnType<typeof createAuthRemoteUserActions>;

export function createAuthSessionActions(store: AuthStore, logs: AuthLogs, remote: RemoteActions) {
  const { state, setters } = store;

  async function deleteAccount(password?: string) {
    if (!state.authToken) throw new Error("Log in again before deleting your account.");
    const session = await appApiRequest<{ user: RemoteUser }>("/api/session", {}, state.authToken);
    const provider = session.user.provider ?? "email";
    const credential = provider === "email" ? null : await authenticateNativeProvider(provider);
    await appApiRequest("/api/account", {
      method: "DELETE",
      body: JSON.stringify(provider === "email" ? { password: password ?? "" }
        : { challengeId: credential?.challengeId, identityToken: credential?.identityToken })
    }, state.authToken);
  }

  function completeOnboarding() {
    setters.setOnboardingComplete(true);
    if (!state.authToken) return;
    appApiRequest("/api/onboarding/complete", { method: "POST" }, state.authToken)
      .then((result) => {
        const response = result as { user?: RemoteUser };
        if (response.user) remote.applyRemoteUser(response.user);
      })
      .catch(() => logs.appendLog("Onboarding saved locally and will sync later.", "Account", "warning"));
  }

  function completePcSetup() {
    setters.setPcSetupComplete(true);
    setters.setPcSetupSkipped(false);
  }

  function skipPcSetup() {
    setters.setPcSetupComplete(true);
    setters.setPcSetupSkipped(true);
  }

  return { completeOnboarding, completePcSetup, deleteAccount, skipPcSetup };
}
