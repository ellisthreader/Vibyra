import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import {
  starterAgents,
  starterChanges,
  starterFiles,
  starterLogs,
  starterProjects
} from "../data/appData";
import { getDefaultAgentUrl } from "../utils/network";
import { loadPersistedSession, savePersistedSession } from "../utils/persistence";
import { normalizeChatThreads, normalizeChatTitles } from "../utils/chatThreads";
import { AppDerivedState, AppState } from "./appContextTypes";
import { ChatMessage, FileEntry, ReasoningEffort } from "../types/domain";

const emptyFile: FileEntry = {
  id: "empty",
  name: "No files",
  path: "No files loaded",
  language: "txt",
  changed: "clean",
  body: "Select a project with readable files."
};

const emptyChatMessages: ChatMessage[] = [];

export function useAppState() {
  const persistedSession = useMemo(loadPersistedSession, []);
  const persistedAppState = persistedSession.user?.appState ?? {};
  const [authenticated, setAuthenticated] = useState(Boolean(persistedSession.authToken && persistedSession.user));
  const [authToken, setAuthToken] = useState(persistedSession.authToken);
  const [installId] = useState(persistedSession.installId);
  const [accountId, setAccountId] = useState<number | null>(persistedSession.user?.id ?? null);
  const [accountPlan, setAccountPlan] = useState(persistedSession.user?.plan ?? "free");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authName, setAuthName] = useState(persistedSession.user?.name ?? "");
  const [authEmail, setAuthEmail] = useState(persistedSession.user?.email ?? "");
  const [authPassword, setAuthPassword] = useState("");
  const [creditsBalance, setCreditsBalance] = useState(persistedSession.user?.creditsBalance ?? 0);
  const [creditsUsed, setCreditsUsed] = useState(persistedSession.user?.creditsUsed ?? 0);
  const [onboardingComplete, setOnboardingComplete] = useState(persistedSession.onboardingComplete);
  const [paired, setPaired] = useState(false);
  const [agentUrl, setAgentUrl] = useState(getDefaultAgentUrl);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairingMessage, setPairingMessage] = useState("Open Vibyra Desktop and type the code shown there.");
  const [healthMessage, setHealthMessage] = useState("");
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [pendingPhoneApproval, setPendingPhoneApproval] = useState<AppState["pendingPhoneApproval"]>(null);
  const [connection, setConnection] = useState<AppState["connection"]>(null);
  const [rememberedDesktops, setRememberedDesktops] = useState<AppState["rememberedDesktops"]>(persistedSession.rememberedDesktops);
  const [machineName, setMachineName] = useState("Vibyra Desktop");
  const [projects, setProjects] = useState(starterProjects);
  const [selectedProjectId, setSelectedProjectId] = useState("p1");
  const [selectedModel, setSelectedModel] = useState<AppState["selectedModel"]>("gpt-5.5");
  const [selectedChatModel, setSelectedChatModel] = useState(persistedSession.selectedChatModel);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [agents, setAgents] = useState(starterAgents);
  const [logs, setLogs] = useState(starterLogs);
  const [files, setFiles] = useState(starterFiles);
  const [changes, setChanges] = useState(starterChanges);
  const [selectedFileId, setSelectedFileId] = useState("f1");
  const [buildState, setBuildState] = useState<AppState["buildState"]>("building");
  const [previewState, setPreviewState] = useState<AppState["previewState"]>("offline");
  const [workflowIndex, setWorkflowIndex] = useState(2);
  const [lastPrompt, setLastPrompt] = useState("Add a clean project switcher and wire it to recent workspaces");
  const [agentRequesting, setAgentRequesting] = useState(false);
  const [taskText, setTaskText] = useState("");
  const [chatThreads, setChatThreads] = useState<Record<string, ChatMessage[]>>(() => normalizeChatThreads(persistedAppState.chatThreads));
  const [chatTitles, setChatTitles] = useState<Record<string, string>>(() => normalizeChatTitles(persistedAppState.chatTitles));
  const [newFilePath, setNewFilePath] = useState("note.txt");
  const [command, setCommand] = useState("npm run build");
  const [promptMoney, setPromptMoney] = useState<AppState["promptMoney"]>({
    total: 0,
    count: 0,
    lastEarned: 0,
    longestPromptLength: 0
  });

  const chatMessages = chatThreads[selectedProjectId] ?? emptyChatMessages;
  const setChatMessages = useCallback<Dispatch<SetStateAction<ChatMessage[]>>>((update) => {
    setChatThreads((current) => {
      const previous = current[selectedProjectId] ?? emptyChatMessages;
      const nextMessages = typeof update === "function" ? update(previous) : update;
      return {
        ...current,
        [selectedProjectId]: nextMessages
      };
    });
  }, [selectedProjectId]);

  useEffect(() => {
    savePersistedSession({
      authToken,
      installId,
      onboardingComplete,
      selectedChatModel,
      rememberedDesktops,
      user: accountId ? {
        id: accountId,
        name: authName || "Vibyra User",
        email: authEmail,
        plan: accountPlan,
        creditsBalance,
        creditsUsed,
        onboardingComplete,
        rememberedDesktops,
        appState: { chatThreads, chatTitles, selectedModel, selectedChatModel, promptMoney }
      } : null
    });
  }, [
    accountId,
    accountPlan,
    authEmail,
    authName,
    authToken,
    chatThreads,
    chatTitles,
    creditsBalance,
    creditsUsed,
    installId,
    onboardingComplete,
    promptMoney,
    rememberedDesktops,
    selectedChatModel,
    selectedModel
  ]);

  const derived: AppDerivedState = useMemo(() => {
    const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
    const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0] ?? emptyFile;
    return {
      selectedProject,
      selectedFile,
      activeAgents: agents.filter((agent) => agent.state === "running" || agent.state === "waiting"),
      latestOutput: logs[0]?.message ?? "No output yet"
    };
  }, [agents, files, logs, projects, selectedFileId, selectedProjectId]);

  return {
    state: {
      authenticated, authToken, installId, accountId, accountPlan, authMode,
      authName, authEmail, authPassword, creditsBalance, creditsUsed, onboardingComplete,
      paired, agentUrl, pairCode, pairing, pairingError, pairingMessage,
      healthMessage, checkingHealth, pendingPhoneApproval, connection, rememberedDesktops,
      machineName, projects, selectedProjectId, selectedModel, selectedChatModel, reasoningEffort,
      agents, logs, files, changes, selectedFileId, buildState, previewState,
      workflowIndex, lastPrompt, agentRequesting, taskText, chatMessages, chatThreads, chatTitles,
      newFilePath, command, promptMoney
    },
    derived,
    setters: {
      setAuthenticated, setAuthToken, setAccountId, setAccountPlan, setAuthMode,
      setAuthName, setAuthEmail, setAuthPassword, setCreditsBalance, setCreditsUsed,
      setOnboardingComplete, setPaired, setAgentUrl, setPairCode, setPairing, setPairingError,
      setPairingMessage, setHealthMessage, setCheckingHealth,
      setPendingPhoneApproval, setConnection, setRememberedDesktops, setMachineName, setProjects,
      setSelectedProjectId, setSelectedModel, setSelectedChatModel, setReasoningEffort, setAgents,
      setLogs, setFiles, setChanges, setSelectedFileId, setBuildState,
      setPreviewState, setWorkflowIndex, setLastPrompt, setAgentRequesting,
      setTaskText, setChatMessages, setChatThreads, setChatTitles, setNewFilePath, setCommand, setPromptMoney
    }
  };
}

