import React, { createContext, PropsWithChildren, useCallback, useContext, useMemo } from "react";
import { LevelUpNotification } from "../components/LevelUpNotification";
import { appApiRequest, LevelActivityResponse } from "../utils/appApi";
import { useAgentActions } from "./useAgentActions";
import { useAppRemoteSync } from "./useAppRemoteSync";
import { AppContextValue } from "./appContextTypes";
import { AppDomainProviders } from "./AppDomainProviders";
import { useAppState } from "./useAppState";
import { useAuthContextActions } from "./useAuthContextActions";
import { useDesktopUrlPromotion } from "./useDesktopUrlPromotion";
import { useDisconnectDesktop } from "./useDisconnectDesktop";
import { useEditPermissionActions } from "./useEditPermissionActions";
import { useLiveSync } from "./useLiveSync";
import { useLoadChatSkills } from "./useLoadChatSkills";
import { useLocalChatActions } from "./useLocalChatActions";
import { useLogActions } from "./useLogActions";
import { usePairingActions } from "./usePairingActions";
import { usePairingDeepLink } from "./pairingDeepLink";
import { useProjectBriefActions } from "./useProjectBriefActions";
import { useProjectMemoryActions } from "./useProjectMemoryActions";
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
  const handleInvalidDesktopSession = useCallback(() => disconnectDesktop({
    clearRememberedToken: true,
    healthMessage: "Secure desktop session expired. Reconnect this phone to Vibyra Desktop.",
    logMessage: "Secure desktop session expired. Reconnect this phone to Vibyra Desktop."
  }), [disconnectDesktop]);
  const requests = useRequests({
    agentUrl: state.agentUrl,
    connection: state.connection,
    onDesktopRequestUrlResolved: promoteDesktopUrl,
    onInvalidDesktopSession: handleInvalidDesktopSession
  });
  const workspace = useWorkspaceActions(store, requests, logs);
  const pairing = usePairingActions(store.state, setters, requests, logs, { loadProjectFilesWithConnection: workspace.loadProjectFilesWithConnection });
  usePairingDeepLink({
    accountId: state.accountId,
    pairMachineAt: pairing.pairMachineAt,
    setAgentUrl: setters.setAgentUrl,
    setPairCode: setters.setPairCode,
    setPairingMessage: setters.setPairingMessage
  });
  const authActions = useAuthContextActions(store, logs);
  const agent = useAgentActions(store, requests, logs, authActions);
  const localChatActions = useLocalChatActions(store);
  const terminal = useTerminalCommandActions(store, requests, logs);
  const projectMemoryActions = useProjectMemoryActions(store);
  const projectBriefActions = { ...useProjectBriefActions(store), ...useProjectBriefChatActions(store) };
  const editActions = useEditPermissionActions(store, requests, logs, { undoCodeChange: workspace.undoCodeChange });
  const handleLiveConnectionLost = useCallback(() => disconnectDesktop({
    healthMessage: "Vibyra Desktop disconnected. Reconnect this phone to continue.",
    logMessage: "Lost connection to Vibyra Desktop.",
    rememberedStatus: "offline"
  }), [disconnectDesktop]);

  useLoadChatSkills(setters.setChatSkills);
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
    ...projectMemoryActions,
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
            authActions.applyRemoteUsage(result.user);
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
    setAuthReferralCode: setters.setAuthReferralCode,
    setAgentUrl: setters.setAgentUrl,
    setPairCode: setters.setPairCode,
    setSelectedModel: setters.setSelectedModel,
    setSelectedChatModel: setters.setSelectedChatModel,
    setReasoningEffort: setters.setReasoningEffort,
    setDesktopPermissionMode: (mode, projectId) => {
      setters.setDesktopPermissionMode("ask");
      if (!projectId) return;
      setters.setEditApprovals((current) => {
        const next = { ...current };
        if (mode === "auto") next[projectId] = "always";
        else delete next[projectId];
        return next;
      });
    },
    setTaskText: setters.setTaskText,
    setDetachedChatThreads: setters.setDetachedChatThreads,
    setDetachedChatTitles: setters.setDetachedChatTitles,
    setDetachedChatUpdatedAt: setters.setDetachedChatUpdatedAt,
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
    projectMemoryActions,
    pairing,
    workspace,
    agent,
    disconnectDesktop
  ]);

  return <AppContext.Provider value={value}><AppDomainProviders app={value}>{children}</AppDomainProviders>
    <LevelUpNotification enabled={state.authenticated && state.persistenceReady} levelProgress={state.levelProgress} />
  </AppContext.Provider>;
}
export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useAppContext must be used inside AppProvider");
  return value;
}
