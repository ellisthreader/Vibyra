import { lazy, Suspense, useEffect, useRef } from "react";

import { DeferredPostUpdateChangelog } from "./components/changelog/DeferredPostUpdateChangelog";
import { StartupUpdateScreen } from "./components/startup/StartupUpdateScreen";
import { onAccountChanged } from "./ipc/account";
import { signalAppReady } from "./lib/bootHandoff";
import { useStartupUpdate } from "./lib/useStartupUpdate";
import { useAccountStore } from "./state/accountStore";

type AuthModule = {
  default: (typeof import("./components/auth/AuthScreen"))["AuthScreen"];
};
type WorkspaceModule = {
  default: (typeof import("./components/layout/WorkspaceApp"))["WorkspaceApp"];
};

let authModule: Promise<AuthModule> | null = null;
let workspaceModule: Promise<WorkspaceModule> | null = null;
function loadAuthScreen(): Promise<AuthModule> {
  if (!authModule) {
    authModule = import("./components/auth/AuthScreen")
      .then((module) => ({ default: module.AuthScreen }))
      .catch((error) => {
        authModule = null;
        throw error;
      });
  }
  return authModule;
}

function loadWorkspaceApp(): Promise<WorkspaceModule> {
  if (!workspaceModule) {
    workspaceModule = import("./components/layout/WorkspaceApp")
      .then((module) => ({ default: module.WorkspaceApp }))
      .catch((error) => {
        workspaceModule = null;
        throw error;
      });
  }
  return workspaceModule;
}

const AuthScreen = lazy(loadAuthScreen);
const WorkspaceApp = lazy(loadWorkspaceApp);

/** Update preflight and account restoration start together. Nothing that can
 * own a live terminal mounts until the packaged-app update gate has cleared. */
export default function App() {
  const status = useAccountStore((s) => s.snapshot.status);
  const startup = useStartupUpdate();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    void useAccountStore.getState().restore();
  }, []);

  useEffect(() => {
    if (status === "signedIn") void loadWorkspaceApp().catch(() => {});
    else if (status !== "restoring") void loadAuthScreen().catch(() => {});
  }, [status]);

  useEffect(() => {
    const unlisten = onAccountChanged((snapshot) => {
      useAccountStore.getState().applySnapshot(snapshot);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // A packaged update check is itself a useful first screen, so hand over to
  // it immediately. In development the gate is already complete and the boot
  // splash still waits until account restoration chooses the first route.
  useEffect(() => {
    if (!startup.complete || status !== "restoring") {
      signalAppReady();
    }
  }, [startup.complete, status]);

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

  if (!startup.complete) {
    return (
      <StartupUpdateScreen
        phase={startup.phase}
        version={startup.version}
        progress={startup.progress}
        error={startup.error}
        onRetry={startup.retry}
        onContinue={startup.continueToApp}
      />
    );
  }

  if (status !== "signedIn") {
    return (
      <>
        <Suspense fallback={<div className="boot">Opening Vibyra…</div>}>
          <AuthScreen />
        </Suspense>
        {status !== "restoring" ? <DeferredPostUpdateChangelog /> : null}
      </>
    );
  }
  return (
    <>
      <Suspense fallback={<div className="boot">Opening Vibyra…</div>}>
        <WorkspaceApp />
      </Suspense>
      <DeferredPostUpdateChangelog />
    </>
  );
}
