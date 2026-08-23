import { appApiRequest } from "../utils/appApi";
import type { AuthLogs, AuthStore } from "./authActionTypes";

export function createAuthProfileActions({ state, setters }: AuthStore, logs: AuthLogs) {
  function updateProfile(changes: { name?: string; email?: string; machineName?: string; profileImageUri?: string }) {
    if (typeof changes.name === "string") setters.setAuthName(changes.name);
    if (typeof changes.email === "string") setters.setAuthEmail(changes.email);
    if (typeof changes.machineName === "string") setters.setMachineName(changes.machineName);
    if (typeof changes.profileImageUri === "string") setters.setProfileImageUri(changes.profileImageUri);
    if (!state.authToken || (changes.name === undefined && changes.email === undefined)) return;
    appApiRequest("/api/account/profile", {
      method: "POST",
      body: JSON.stringify({ name: changes.name ?? state.authName, email: changes.email ?? state.authEmail })
    }, state.authToken).catch(() => {
      logs.appendLog("Profile saved locally and will sync later.", "Account", "warning");
    });
  }
  return { updateProfile };
}
