import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo } from "react";
import { LevelUpNotification } from "../components/LevelUpNotification";
import type { AgentConnection, RememberedDesktop } from "../types/domain";
import { appApiRequest, LevelActivityResponse, SkillsResponse } from "../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../utils/network";
import { useAgentActions } from "./useAgentActions";
import { useAppRemoteSync } from "./useAppRemoteSync";
import { AppContextValue } from "./appContextTypes";
import { useAppState } from "./useAppState";
import { useAuthContextActions } from "./useAuthContextActions";
import { useDesktopUrlPromotion } from "./useDesktopUrlPromotion";
import { useEditPermissionActions } from "./useEditPermissionActions";
import { useLiveSync } from "./useLiveSync";
import { useLocalChatActions } from "./useLocalChatActions";
import { useLogActions } from "./useLogActions";
import { usePairingActions } from "./usePairingActions";
import { useProjectBriefActions } from "./useProjectBriefActions";
import { useProjectBriefChatActions } from "./useProjectBriefChatActions";
import { useRequests } from "./useRequests";
import { useTerminalCommandActions } from "./useTerminalCommandActions";
import { useWorkspaceActions } from "./useWorkspaceActions";

const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const store = useAppState();
  const { state, derived, setters } = store;
  const logs = useLogActions(setters);
  const disconnectDesktop = useDisconnectDesktop(store, logs);
  const promoteDesktopUrl = useDesktopUrlPromotion(store);
  const requests = useRequests({
    agentUrl: state.agentUrl,
    connection: state.connection,
    onDesktopRequestUrlResolved: promoteDesktopUrl,
    onInvalidDesktopSession: () => disconnectDesktop({
      clearRememberedToken: true,
      healthMessage: "Secure desktop session expired. Reconnect this phone to Vibyra Desktop.",
      logMessage: "Secure desktop session expired. Reconnect this phone to Vibyra Desktop."
    })
  });
  const workspace = useWorkspaceActions(store, requests, logs);
  const pairing = usePairingActions(store.state, setters, requests, logs, { loadProjectFilesWithConnection: workspace.loadProjectFilesWithConnection });
  const authActions = useAuthContextActions(store, logs);
  const agent = useAgentActions(store, requests, logs, authActions);
  const localChatActions = useLocalChatActions(store);
  const terminal = useTerminalCommandActions(store, requests, logs);
  const projectBriefActions = { ...useProjectBriefActions(store), ...useProjectBriefChatActions(store) };
  const editActions = useEditPermissionActions(store, requests, logs, { undoCodeChange: workspace.undoCodeChange });
  const handleLiveConnectionLost = useCallback(() => disconnectDesktop({
    healthMessage: "Vibyra Desktop disconnected. Reconnect this phone to continue.",
    logMessage: "Lost connection to Vibyra Desktop.",
    rememberedStatus: "offline"
  }), [disconnectDesktop]);

  useLoadSkills(setters.setChatSkills);
  useLiveSync(state.connection, requests, setters, handleLiveConnectionLost);
  useAppRemoteSync(state, logs, authActions);

  const value = useMemo<AppContextValue>(() => ({
    ...state,
    ...derived,
    ...authActions,
    ...editActions,
    ...localChatActions,
    addLocalGeneratedImage: localChatActions.addLocalGeneratedImage,
    ...terminal,
    ...projectBriefActions,
    disconnectDesktop,
    resetPromptMoney: () => {
      setters.setPromptMoney({ total: 0, count: 0, lastEarned: 0, longestPromptLength: 0 });
    },
    revertPreviewCode: (messageId) => {
      setters.setChatThreads((threads) => Object.fromEntries(Object.entries(threads).map(([projectId, messages]) => [
        projectId,
        messages.map((message) => {
          if (message.id !== messageId) return message;
          const next = { ...message };
          delete next.app;
          delete next.codeChanges;
          delete next.codeFiles;
          delete next.editApproval;
          return next;
        })
      ])));
    },
    reportLevelActivity: (action, contextId, meta = {}) => {
      if (!state.authToken) return;
      appApiRequest<LevelActivityResponse>("/api/level/activity", {
        method: "POST",
        body: JSON.stringify({ action, contextId, meta })
      }, state.authToken)
        .then((result) => {
          if (result.user) {
            authActions.applyRemoteUserFromIap(result.user);
            return;
          }
          if (result.level) setters.setLevelProgress(result.level);
        })
        .catch(() => {
          /* Level activity is nice-to-have telemetry; primary actions should not fail on it. */
        });
    },
    setAuthMode: setters.setAuthMode,
    setAuthName: setters.setAuthName,
    setAuthEmail: setters.setAuthEmail,
    setAuthPassword: setters.setAuthPassword,
    setAgentUrl: setters.setAgentUrl,
    setPairCode: setters.setPairCode,
    setSelectedModel: setters.setSelectedModel,
    setSelectedChatModel: setters.setSelectedChatModel,
    setReasoningEffort: setters.setReasoningEffort,
    setTaskText: setters.setTaskText,
    setNewFilePath: setters.setNewFilePath,
    ...pairing,
    ...workspace,
    ...agent
  }), [
    state,
    derived,
    setters,
    authActions,
    editActions,
    localChatActions,
    terminal,
    projectBriefActions,
    pairing,
    workspace,
    agent,
    disconnectDesktop
  ]);

  return <AppContext.Provider value={value}>{children}<LevelUpNotification enabled={state.authenticated && state.persistenceReady} levelProgress={state.levelProgress} /></AppContext.Provider>;
}

function useDisconnectDesktop(store: ReturnType<typeof useAppState>, logs: ReturnType<typeof useLogActions>) {
  const { state, setters } = store;
  return useCallback((options: { clearRememberedToken?: boolean; healthMessage?: string; logMessage?: string; notifyDesktop?: boolean; rememberedStatus?: RememberedDesktop["status"] } = {}) => {
    const activeConnection = state.connection;
    const clearRememberedToken = Boolean(options.clearRememberedToken);
    if (activeConnection && options.notifyDesktop !== false && !clearRememberedToken) {
      void notifyDesktopDisconnect(activeConnection);
    }
    setters.setConnection(null);
    setters.setPaired(false);
    setters.setPendingPhoneApproval(null);
    setters.setPairing(false);
    setters.setPairingError("");
    setters.setPairingMessage("Open Vibyra Desktop and type the code shown there.");
    setters.setHealthMessage(options.healthMessage ?? "Disconnected from Vibyra Desktop.");
    setters.setPreviewState("offline");
    setters.setFiles([]);
    setters.setSelectedFileId("empty");
    setters.setRememberedDesktops((current) => current.map((desktop) => {
      const activeUrls = new Set([activeConnection?.url, ...(activeConnection?.connectionUrls ?? [])].filter(Boolean));
      const desktopUrls = [desktop.url, ...(desktop.connectionUrls ?? [])].filter(Boolean);
      const matchesActive = desktop.status === "current" || desktopUrls.some((url) => activeUrls.has(url));
      if (!matchesActive) return desktop;
      const status = options.rememberedStatus ?? (clearRememberedToken ? "offline" as const : "online" as const);
      const next = { ...desktop, status };
      if (clearRememberedToken) delete next.token;
      return next;
    }));
    logs.appendLog(options.logMessage ?? "Phone disconnected from Vibyra Desktop.", "Desktop", "warning");
  }, [logs, setters, state.connection]);
}

async function notifyDesktopDisconnect(connection: AgentConnection) {
  const urls = uniqueValues([connection.url, ...(connection.connectionUrls ?? [])].map(normalizeAgentUrl));
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(`${url}/desktop/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" }
      }, 1200);
      if (response.ok) return;
    } catch {
    }
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function useLoadSkills(setChatSkills: ReturnType<typeof useAppState>["setters"]["setChatSkills"]) {
  useEffect(() => {
    let cancelled = false;
    appApiRequest<SkillsResponse>("/api/skills", undefined, undefined, { background: true })
      .then((result) => { if (!cancelled && result.skills) setChatSkills(result.skills); })
      .catch(() => { /* skills are optional; silent fallback */ });
    return () => { cancelled = true; };
  }, [setChatSkills]);
}

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useAppContext must be used inside AppProvider");
  return value;
}
