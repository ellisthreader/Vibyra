import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo } from "react";
import { appApiRequest, AuthResponse, RemoteUser, SkillsResponse } from "../utils/appApi";
import { normalizePersistedUser } from "../utils/persistence";
import { makeId } from "../utils/ids";
import { streamChatText, TYPING_CURSOR } from "../utils/chatStream";
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

  const setChatSkills = setters.setChatSkills;
  useEffect(() => {
    let cancelled = false;
    appApiRequest<SkillsResponse>("/api/skills", undefined, undefined, { background: true })
      .then((result) => { if (!cancelled && result.skills) setChatSkills(result.skills); })
      .catch(() => { /* skills are optional; silent fallback */ });
    return () => { cancelled = true; };
  }, [setChatSkills]);

  useLiveSync(state.connection, requests, setters, logs);
  useCloudSync({
    authenticated: state.authenticated,
    authToken: state.authToken,
    onboardingComplete: state.onboardingComplete,
    rememberedDesktops: state.rememberedDesktops,
    chatThreads: state.chatThreads,
    chatTitles: state.chatTitles,
    chatProjects: state.chatProjects,
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
    if (normalized.appState?.chatProjects && typeof normalized.appState.chatProjects === "object") {
      const restored = normalized.appState.chatProjects as AppContextValue["chatProjects"];
      setters.setChatProjects(restored);
      const restoredList = Object.values(restored);
      if (restoredList.length > 0) {
        setters.setProjects((current) => {
          const ids = new Set(current.map((p) => p.id));
          const additions = restoredList.filter((p) => !ids.has(p.id));
          return additions.length > 0 ? [...additions, ...current] : current;
        });
      }
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
    applyRemoteUserFromIap: (user: RemoteUser) => {
      applyRemoteUser(user);
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
      const assistantId = makeId("chat-assistant");
      setters.setChatThreads((current) => ({
        ...current,
        [projectId]: [
          ...(current[projectId] ?? []),
          { id: makeId("chat-user"), role: "user", text: prompt, file },
          { id: assistantId, role: "assistant", text: TYPING_CURSOR, file }
        ]
      }));
      setters.setTaskText("");
      streamChatText(reply, (text) => {
        setters.setChatThreads((current) => {
          const thread = current[projectId];
          if (!thread) return current;
          return {
            ...current,
            [projectId]: thread.map((m) => (m.id === assistantId ? { ...m, text } : m))
          };
        });
      });
    },
    addLocalChatProposal: (prompt, reply, matches, target, query) => {
      const projectId = target?.chatProjectId ?? target?.projectId ?? target?.project?.id ?? state.selectedProjectId;
      const targetFile = target?.file === null
        ? null
        : target?.file ?? (projectId === state.selectedProjectId && derived.selectedFile.id !== "empty" ? derived.selectedFile : null);
      const file = targetFile?.path;
      const proposalId = makeId("proposal");
      const assistantId = makeId("chat-assistant");
      setters.setChatThreads((current) => ({
        ...current,
        [projectId]: [
          ...(current[projectId] ?? []),
          { id: makeId("chat-user"), role: "user", text: prompt, file },
          {
            id: assistantId,
            role: "assistant",
            text: TYPING_CURSOR,
            file,
            folderProposal: { id: proposalId, status: "pending", matches, selectedIndex: 0, query: query ?? prompt }
          }
        ]
      }));
      setters.setTaskText("");
      streamChatText(reply, (text) => {
        setters.setChatThreads((current) => {
          const thread = current[projectId];
          if (!thread) return current;
          return {
            ...current,
            [projectId]: thread.map((m) => (m.id === assistantId ? { ...m, text } : m))
          };
        });
      });
      return { proposalProjectId: projectId };
    },
    addLocalFolderRecovery: (prompt, reply, recovery, target) => {
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
          { id: makeId("chat-assistant"), role: "assistant", text: reply, file, folderRecovery: recovery }
        ]
      }));
      setters.setTaskText("");
    },
    resolveFolderProposal: (proposalId, status, projectId) => {
      const targetProjectId = projectId ?? state.selectedProjectId;
      setters.setChatThreads((current) => {
        const thread = current[targetProjectId];
        if (!thread) return current;
        return {
          ...current,
          [targetProjectId]: thread.map((message) => (
            message.folderProposal?.id === proposalId
              ? { ...message, folderProposal: { ...message.folderProposal, status } }
              : message
          ))
        };
      });
    },
    updateFolderProposal: (proposalId, update, projectId) => {
      const targetProjectId = projectId ?? state.selectedProjectId;
      setters.setChatThreads((current) => {
        const thread = current[targetProjectId];
        if (!thread) return current;
        return {
          ...current,
          [targetProjectId]: thread.map((message) => (
            message.folderProposal?.id === proposalId
              ? { ...message, folderProposal: { ...message.folderProposal, ...update } }
              : message
          ))
        };
      });
    },
    setAuthMode: setters.setAuthMode,
    setAuthName: setters.setAuthName,
    setAuthEmail: setters.setAuthEmail,
    setAuthPassword: setters.setAuthPassword,
    signOut: () => {
      setters.setAuthenticated(false);
      setters.setAuthToken("");
      setters.setAccountId(null);
      setters.setAuthPassword("");
      setters.setOnboardingComplete(false);
      setters.setChatThreads({});
      setters.setChatTitles({});
      setters.setChatProjects({});
      setters.setConnection(null);
      setters.setRememberedDesktops([]);
      setters.setProjects([]);
      setters.setAgents([]);
      setters.setLogs([]);
      setters.setFiles([]);
      setters.setChanges([]);
    },
    updateProfile: (changes) => {
      if (typeof changes.name === "string") setters.setAuthName(changes.name);
      if (typeof changes.email === "string") setters.setAuthEmail(changes.email);
      if (typeof changes.machineName === "string") setters.setMachineName(changes.machineName);
      if (state.authToken) {
        appApiRequest("/api/account/profile", {
          method: "POST",
          body: JSON.stringify({
            name: changes.name ?? state.authName,
            email: changes.email ?? state.authEmail
          })
        }, state.authToken).catch(() => {
          logs.appendLog("Profile saved locally and will sync later.", "Account", "warning");
        });
      }
    },
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
