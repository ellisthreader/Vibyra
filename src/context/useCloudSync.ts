import { useEffect, useRef } from "react";
import { LogEvent, Project, RememberedDesktop } from "../types/domain";
import { appApiRequest, BackendOfflineError, isAppSessionExpiredError } from "../utils/appApi";

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
  detachedChatThreads: unknown;
  detachedChatTitles: unknown;
  detachedChatUpdatedAt: unknown;
  chatProjects: Record<string, Project>;
  projectMemories: unknown;
  editApprovals: unknown;
  promptMoney: unknown;
  desktopPermissionMode: string;
  selectedChatModel: string;
  selectedModel: string;
};

export function useCloudSync(snapshot: Snapshot, logs: Logs, onSessionExpired?: () => void) {
  const {
    authenticated,
    authToken,
    onboardingComplete,
    rememberedDesktops,
    chatThreads,
    chatTitles,
    detachedChatThreads,
    detachedChatTitles,
    detachedChatUpdatedAt,
    chatProjects,
    projectMemories,
    editApprovals,
    promptMoney,
    desktopPermissionMode,
    selectedChatModel,
    selectedModel
  } = snapshot;

  const nextAttemptAtRef = useRef(0);
  const cooldownLoggedRef = useRef(false);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    if (!authenticated || !authToken) return undefined;

    const timeout = setTimeout(() => {
      if (Date.now() < nextAttemptAtRef.current) return;

      appApiRequest("/api/session/state", {
        method: "POST",
        body: JSON.stringify({
          onboardingComplete,
          rememberedDesktops: rememberedDesktops.map(({ token, ...desktop }) => desktop),
          appState: { chatThreads, chatTitles, detachedChatThreads, detachedChatTitles, detachedChatUpdatedAt, chatProjects, projectMemories, editApprovals, promptMoney, desktopPermissionMode, selectedChatModel, selectedModel }
        })
      }, authToken, { background: true }).then(() => {
        nextAttemptAtRef.current = 0;
        cooldownLoggedRef.current = false;
      }).catch((error: unknown) => {
        if (isAppSessionExpiredError(error)) {
          onSessionExpiredRef.current?.();
          return;
        }
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
    detachedChatThreads,
    detachedChatTitles,
    detachedChatUpdatedAt,
    chatProjects,
    projectMemories,
    editApprovals,
    onboardingComplete,
    promptMoney,
    desktopPermissionMode,
    rememberedDesktops,
    selectedChatModel,
    selectedModel
  ]);
}

function errorIsBackendOffline(error: unknown) {
  return error instanceof BackendOfflineError
    || (error instanceof Error && error.name === "BackendOfflineError");
}
