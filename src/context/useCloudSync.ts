import { useEffect, useRef } from "react";
import { LogEvent, Project, RememberedDesktop } from "../types/domain";
import { appApiRequest, BackendOfflineError, isAppSessionExpiredError } from "../utils/appApi";
import { createPersistableAppState } from "./appStatePersistence";
import { createCloudStateTransport } from "../utils/cloudStateTransport";
import { AppApiError } from "../utils/appApiErrors";
import { createPersistenceWriteQueue } from "../utils/persistenceWriteQueue";

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
  profileImageUri: string;
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
    profileImageUri,
    promptMoney,
    desktopPermissionMode,
    selectedChatModel,
    selectedModel
  } = snapshot;

  const nextAttemptAtRef = useRef(0);
  const transportRef = useRef(createCloudStateTransport((path, body, token) =>
    appApiRequest(path, { method: "POST", body }, token, { background: true })
  ));
  const cooldownLoggedRef = useRef(false);
  const lastQueuedPayloadRef = useRef("");
  const lastSyncedPayloadRef = useRef("");
  const latestPayloadKeyRef = useRef("");
  const syncQueueRef = useRef(createPersistenceWriteQueue<() => Promise<void>>((work) => work()));
  const mountedRef = useRef(true);
  const activeAuthTokenRef = useRef(authenticated ? authToken : "");
  const logsRef = useRef(logs);
  const onSessionExpiredRef = useRef(onSessionExpired);
  activeAuthTokenRef.current = authenticated ? authToken : "";
  logsRef.current = logs;

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated || !authToken) return undefined;

    const timeout = setTimeout(() => {
      const appState = createPersistableAppState({
        chatThreads: chatThreads as Record<string, unknown>,
        chatTitles: chatTitles as Record<string, unknown>,
        detachedChatThreads: detachedChatThreads as Record<string, unknown>,
        detachedChatTitles: detachedChatTitles as Record<string, unknown>,
        detachedChatUpdatedAt: detachedChatUpdatedAt as Record<string, unknown>,
        chatProjects,
        projectMemories,
        editApprovals,
        profileImageUri,
        promptMoney,
        desktopPermissionMode,
        selectedChatModel,
        selectedModel
      });

      const body = JSON.stringify({
        onboardingComplete,
        rememberedDesktops: rememberedDesktops.map(({ token, ...desktop }) => desktop),
        appState
      });
      const payloadKey = `${authToken}\u0000${body}`;
      latestPayloadKeyRef.current = payloadKey;
      if (payloadKey === lastSyncedPayloadRef.current || payloadKey === lastQueuedPayloadRef.current) return;
      lastQueuedPayloadRef.current = payloadKey;

      // Keep one in-flight save and one replaceable pending snapshot, even
      // during the network cooldown. Stale histories must not accumulate.
      void syncQueueRef.current.save(async () => {
        while (
          mountedRef.current
          && activeAuthTokenRef.current === authToken
          && latestPayloadKeyRef.current === payloadKey
          && lastSyncedPayloadRef.current !== payloadKey
        ) {
          const waitMs = Math.max(0, nextAttemptAtRef.current - Date.now());
          if (waitMs) await delay(waitMs);
          if (!mountedRef.current || activeAuthTokenRef.current !== authToken || latestPayloadKeyRef.current !== payloadKey) return;

          try {
            await transportRef.current(body, authToken);
            lastSyncedPayloadRef.current = payloadKey;
            nextAttemptAtRef.current = 0;
            cooldownLoggedRef.current = false;
          } catch (error: unknown) {
            if (isAppSessionExpiredError(error)) {
              onSessionExpiredRef.current?.();
              return;
            }
            if (error instanceof AppApiError && error.status === 409) {
              logsRef.current.appendLog("Saved on this device. Cloud changes conflict with this edit; no cloud data was overwritten.", "Account", "warning");
              return;
            }
            nextAttemptAtRef.current = Date.now() + FAILURE_COOLDOWN_MS;
            if (errorIsBackendOffline(error)) continue;

            if (!cooldownLoggedRef.current) {
              cooldownLoggedRef.current = true;
              logsRef.current.appendLog("Saved locally. Cloud sync will retry when the API is reachable.", "Account", "warning");
            }
          }
        }
      });
    }, 700);

    return () => clearTimeout(timeout);
  }, [
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
    profileImageUri,
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

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
