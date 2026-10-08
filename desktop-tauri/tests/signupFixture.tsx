import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { AuthScreen } from "../src/components/auth/AuthScreen";
import { useAccountStore } from "../src/state/accountStore";

declare global {
  interface Window { signupEvents: unknown[][] }
}

document.documentElement.dataset.platform = "mac";
document.documentElement.dataset.theme = "dark";
mockWindows("main");
mockIPC(() => null);
window.signupEvents = [];
useAccountStore.setState({
  snapshot: { status: "signedOut", profile: null, error: null, pendingProvider: null, secureStorage: true },
  startOauth: async (provider, signup) => { window.signupEvents.push(["oauth", provider, signup ?? null]); },
  signupEmail: async (name, email, password, declarations) => {
    window.signupEvents.push(["signup", name, email, password, declarations]);
  },
});

createRoot(document.getElementById("root")!).render(<AuthScreen />);
