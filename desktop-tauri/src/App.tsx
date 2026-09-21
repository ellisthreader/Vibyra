import { useEffect, useRef } from "react";

import { AuthScreen } from "./components/auth/AuthScreen";
import { WorkspaceApp } from "./components/layout/WorkspaceApp";
import { onAccountChanged } from "./ipc/account";
import { useAccountStore } from "./state/accountStore";

/** Session restoration is the first startup checkpoint: the workspace only
 * mounts once the account gate reports a verified sign-in. */
export default function App() {
  const status = useAccountStore((s) => s.snapshot.status);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    void useAccountStore.getState().restore();
  }, []);

  useEffect(() => {
    const unlisten = onAccountChanged((snapshot) => {
      useAccountStore.getState().applySnapshot(snapshot);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // A subscription bought on the phone is authoritative on the next account refresh.
  useEffect(() => {
    if (status !== "signedIn") return;
    const refresh = () => { if (!document.hidden) void useAccountStore.getState().refreshProfile(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [status]);

  // Any sign-out after a successful sign-in (logout elsewhere, remote
  // revocation, expiry) reloads the window so no account-scoped renderer
  // state can leak into the next session.
  useEffect(() => {
    if (status === "signedIn") {
      wasSignedIn.current = true;
    } else if (wasSignedIn.current) {
      window.location.reload();
    }
  }, [status]);

  if (status !== "signedIn") {
    return <AuthScreen />;
  }
  return <WorkspaceApp />;
}
