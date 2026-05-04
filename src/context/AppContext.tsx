import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo } from "react";
import { LogEvent, PreviewState } from "../types/domain";
import { useAgentActions } from "./useAgentActions";
import { AppContextValue } from "./appContextTypes";
import { useAppState } from "./useAppState";
import { useLogActions } from "./useLogActions";
import { usePairingActions } from "./usePairingActions";
import { useRequests } from "./useRequests";
import { useWorkspaceActions } from "./useWorkspaceActions";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const store = useAppState();
  const { state, derived, setters } = store;
  const requests = useRequests({ agentUrl: state.agentUrl, connection: state.connection });
  const logs = useLogActions(setters);
  const workspace = useWorkspaceActions(store, requests, logs);
  const pairing = usePairingActions(store.state, setters, requests, logs, {
    loadProjectFilesWithConnection: workspace.loadProjectFilesWithConnection
  });
  const agent = useAgentActions(store, requests, logs);

  useEffect(() => {
    if (!state.connection) return undefined;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const result = await requests.agentRequest<EventsResult>("/events");
        if (cancelled) return;
        setters.setLogs(result.events);
        if (result.preview?.state) setters.setPreviewState(result.preview.state);
        if (result.selectedProjectId) setters.setSelectedProjectId(result.selectedProjectId);
      } catch {
        if (!cancelled) logs.appendLog("Live Vibyra updates paused", "Desktop", "warning");
      }
    }, 2200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state.connection, requests, setters, logs]);

  const value = useMemo<AppContextValue>(() => ({
    ...state,
    ...derived,
    authenticateWith: (method, accountStatus) => {
      const existingAccount = accountStatus === "existing" || (accountStatus === undefined && state.authMode === "login");
      setters.setAuthenticated(true);
      setters.setOnboardingComplete(existingAccount || state.onboardingComplete);
      if (method !== "email") {
        setters.setAuthEmail("");
        setters.setAuthPassword("");
      }
      if (existingAccount) {
        setters.setAuthName("");
      }
    },
    completeOnboarding: () => {
      setters.setOnboardingComplete(true);
    },
    resetPromptMoney: () => {
      setters.setPromptMoney({
        total: 0,
        count: 0,
        lastEarned: 0,
        longestPromptLength: 0
      });
    },
    setAuthMode: setters.setAuthMode,
    setAuthName: setters.setAuthName,
    setAuthEmail: setters.setAuthEmail,
    setAuthPassword: setters.setAuthPassword,
    setAgentUrl: setters.setAgentUrl,
    setPairCode: setters.setPairCode,
    setSelectedModel: setters.setSelectedModel,
    setReasoningEffort: setters.setReasoningEffort,
    setTaskText: setters.setTaskText,
    setNewFilePath: setters.setNewFilePath,
    ...pairing,
    ...workspace,
    ...agent
  }), [state, derived, setters, pairing, workspace, agent]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useAppContext must be used inside AppProvider");
  }
  return value;
}

type EventsResult = {
  events: LogEvent[];
  preview: { state: PreviewState } | null;
  selectedProjectId: string | null;
};
