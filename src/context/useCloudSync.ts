import { useEffect, useRef } from "react";
import { LogEvent, Project, RememberedDesktop } from "../types/domain";
import { appApiRequest, BackendOfflineError } from "../utils/appApi";

const FAILURE_COOLDOWN_MS = 30000;

type Setters = {
  setOnboardingComplete: (value: boolean) => void;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
};

type Snapshot = {
  authenticated: boolean;
  authToken: string;
  onboardingComplete: boolean;
  rememberedDesktops: RememberedDesktop[];
  chatThreads: unknown;
  chatTitles: unknown;
  chatProjects: Record<string, Project>;
  promptMoney: unknown;
  selectedChatModel: string;
  selectedModel: string;
};

export function useCloudSync(snapshot: Snapshot, logs: Logs) {
  const {
    authenticated,
    authToken,
    onboardingComplete,
    rememberedDesktops,
    chatThreads,
    chatTitles,
    chatProjects,
    promptMoney,
    selectedChatModel,
    selectedModel
  } = snapshot;

  const nextAttemptAtRef = useRef(0);
  const cooldownLoggedRef = useRef(false);

  useEffect(() => {
    if (!authenticated || !authToken) return undefined;

    const timeout = setTimeout(() => {
      if (Date.now() < nextAttemptAtRef.current) return;

      appApiRequest("/api/session/state", {
        method: "POST",
        body: JSON.stringify({
          onboardingComplete,
          rememberedDesktops: rememberedDesktops.map(({ token, ...desktop }) => desktop),
          appState: { chatThreads, chatTitles, chatProjects, promptMoney, selectedChatModel, selectedModel }
        })
      }, authToken, { background: true }).then(() => {
        nextAttemptAtRef.current = 0;
        cooldownLoggedRef.current = false;
      }).catch((error: unknown) => {
        nextAttemptAtRef.current = Date.now() + FAILURE_COOLDOWN_MS;
        if (errorIsBackendOffline(error)) return;

        if (!cooldownLoggedRef.current) {
          cooldownLoggedRef.current = true;
          logs.appendLog("Saved locally. Cloud sync will retry when the API is reachable.", "Account", "warning");
        }
      });
    }, 700);

    return () => clearTimeout(timeout);
  }, [
    logs,
    authToken,
    authenticated,
    chatThreads,
    chatTitles,
    chatProjects,
    onboardingComplete,
    promptMoney,
    rememberedDesktops,
    selectedChatModel,
    selectedModel
  ]);
}

function errorIsBackendOffline(error: unknown) {
  return error instanceof BackendOfflineError
    || (error instanceof Error && error.name === "BackendOfflineError");
}
