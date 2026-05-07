import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo } from "react";
import { appApiRequest, AuthResponse, RemoteUser, SkillsResponse } from "../utils/appApi";
import { normalizePersistedUser } from "../utils/persistence";
import { makeId } from "../utils/ids";
import { useAgentActions } from "./useAgentActions";
import { AppContextValue } from "./appContextTypes";
import { useAppState } from "./useAppState";
import { useCloudSync } from "./useCloudSync";
import { useLiveSync } from "./useLiveSync";
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
    let cancelled = false;
    appApiRequest<SkillsResponse>("/api/skills")
      .then((result) => { if (!cancelled && result.skills) setters.setChatSkills(result.skills); })
      .catch(() => { /* skills are optional; silent fallback */ });
    return () => { cancelled = true; };
  }, [setters]);

  useLiveSync(state.connection, requests, setters, logs);
  useCloudSync({
    authenticated: state.authenticated,
    authToken: state.authToken,
    onboardingComplete: state.onboardingComplete,
    rememberedDesktops: state.rememberedDesktops,
    chatThreads: state.chatThreads,
    chatTitles: state.chatTitles,
    promptMoney: state.promptMoney,
    selectedChatModel: state.selectedChatModel,
    selectedModel: state.selectedModel
  }, logs);

  function applyAuthenticatedUser(token: string, user: RemoteUser) {
    setters.setAuthToken(token);
    applyRemoteUser(user);
  }

  function applyRemoteUser(user: RemoteUser) {
    const normalized = normalizePersistedUser(user);
    if (!normalized) return;

    setters.setAccountId(normalized.id);
    setters.setAccountPlan(normalized.plan);
    setters.setAuthName(normalized.name);
    setters.setAuthEmail(normalized.email);
    setters.setCreditsBalance(normalized.creditsBalance);
    setters.setCreditsUsed(normalized.creditsUsed);
    setters.setOnboardingComplete(normalized.onboardingComplete);
    setters.setRememberedDesktops(normalized.rememberedDesktops);
    const selectedChatModel = normalized.appState?.selectedChatModel;
    if (typeof selectedChatModel === "string" && selectedChatModel) {
      setters.setSelectedChatModel(selectedChatModel);
    }
    if (normalized.appState?.chatThreads && typeof normalized.appState.chatThreads === "object") {
      setters.setChatThreads(normalized.appState.chatThreads as AppContextValue["chatThreads"]);
    }
    if (normalized.appState?.chatTitles && typeof normalized.appState.chatTitles === "object") {
      setters.setChatTitles(normalized.appState.chatTitles as AppContextValue["chatTitles"]);
    }
  }

  const value = useMemo<AppContextValue>(() => ({
    ...state,
    ...derived,
    authenticateWith: async (method, accountStatus) => {
      const existingAccount = accountStatus === "existing" || (accountStatus === undefined && state.authMode === "login");
      const payload = method === "email"
        ? {
            email: state.authEmail.trim(),
            installId: state.installId,
            name: state.authName.trim(),
            password: state.authPassword
          }
        : {
            installId: state.installId,
            name: state.authName.trim() || providerDisplayName(method),
            provider: method,
            providerId: state.installId
          };
      const endpoint = method === "email" && !existingAccount ? "/api/auth/signup" : "/api/auth/login";
      const result = await appApiRequest<AuthResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      applyAuthenticatedUser(result.token, result.user);
      setters.setAuthenticated(true);
      setters.setAuthPassword("");
    },
    completeOnboarding: () => {
      setters.setOnboardingComplete(true);
      if (state.authToken) {
        appApiRequest("/api/onboarding/complete", { method: "POST" }, state.authToken)
          .then((result) => {
            const response = result as { user?: RemoteUser };
            if (response.user) applyRemoteUser(response.user);
          })
          .catch(() => {
            logs.appendLog("Onboarding saved locally and will sync later.", "Account", "warning");
          });
      }
    },
    resetPromptMoney: () => {
      setters.setPromptMoney({ total: 0, count: 0, lastEarned: 0, longestPromptLength: 0 });
    },
    clearCurrentChat: (projectId = state.selectedProjectId) => {
      setters.setChatThreads((current) => ({
        ...current,
        [projectId]: []
      }));
      setters.setChatTitles((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setters.setTaskText("");
    },
    addLocalChatReply: (prompt, reply, target) => {
      const projectId = target?.chatProjectId ?? target?.projectId ?? target?.project?.id ?? state.selectedProjectId;
      const targetFile = target?.file === null
        ? null
        : target?.file ?? (projectId === state.selectedProjectId && derived.selectedFile.id !== "empty" ? derived.selectedFile : null);
      const file = targetFile?.path;
      setters.setChatThreads((current) => ({
        ...current,
        [projectId]: [
          ...(current[projectId] ?? []),
          { id: makeId("chat-user"), role: "user", text: prompt, file },
          { id: makeId("chat-assistant"), role: "assistant", text: reply, file }
        ]
      }));
      setters.setTaskText("");
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
  }), [state, derived, setters, pairing, workspace, agent, logs]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function providerDisplayName(method: "apple" | "google" | "microsoft" | "email") {
  if (method === "apple") return "Apple User";
  if (method === "google") return "Google User";
  if (method === "microsoft") return "Microsoft User";
  return "Vibyra User";
}

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useAppContext must be used inside AppProvider");
  }
  return value;
}
