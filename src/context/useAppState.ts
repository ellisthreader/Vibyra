import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { starterAgents, starterChanges, starterFiles, starterLogs, starterProjects } from "../data/appData";
import { getDefaultAgentUrl } from "../utils/network";
import { isRunArtifact } from "../utils/files";
import { createEmptyPersistedSession, loadPersistedSession, savePersistedSession } from "../utils/persistence";
import { AppDerivedState, AppState } from "./appContextTypes";
import { ChatMessage, DesktopPermissionMode, ReasoningEffort } from "../types/domain";
import { emptyChatMessages, emptyFile, emptyProject } from "./appStateDefaults";
import { getPersistedAppState } from "./appStatePersistence";

export function useAppState() {
  const persistedSession = useMemo(createEmptyPersistedSession, []);
  const initialAppState = useMemo(() => getPersistedAppState(persistedSession), [persistedSession]);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(Boolean(persistedSession.authToken && persistedSession.user));
  const [authToken, setAuthToken] = useState(persistedSession.authToken);
  const [installId, setInstallId] = useState(persistedSession.installId);
  const [accountId, setAccountId] = useState<number | null>(persistedSession.user?.id ?? null);
  const [accountPlan, setAccountPlan] = useState(persistedSession.user?.plan ?? "free");
  const [levelProgress, setLevelProgress] = useState(persistedSession.user?.level);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authName, setAuthName] = useState(persistedSession.user?.name ?? "");
  const [authEmail, setAuthEmail] = useState(persistedSession.user?.email ?? "");
  const [authPassword, setAuthPassword] = useState("");
  const [authReferralCode, setAuthReferralCode] = useState("");
  const [profileImageUri, setProfileImageUri] = useState(initialAppState.profileImageUri);
  const [creditsBalance, setCreditsBalance] = useState(persistedSession.user?.creditsBalance ?? 0);
  const [creditsUsed, setCreditsUsed] = useState(persistedSession.user?.creditsUsed ?? 0);
  const [dailyCreditsUsed, setDailyCreditsUsed] = useState(persistedSession.user?.dailyCreditsUsed ?? 0);
  const [dailyCreditsCap, setDailyCreditsCap] = useState(persistedSession.user?.dailyCreditsCap ?? 0);
  const [dailyCreditsResetAt, setDailyCreditsResetAt] = useState<string | null>(persistedSession.user?.dailyCreditsResetAt ?? null);
  const [burstCreditsUsed, setBurstCreditsUsed] = useState(persistedSession.user?.burstCreditsUsed ?? 0);
  const [burstCreditsCap, setBurstCreditsCap] = useState(persistedSession.user?.burstCreditsCap ?? 0);
  const [burstCreditsResetAt, setBurstCreditsResetAt] = useState<string | null>(persistedSession.user?.burstCreditsResetAt ?? null);
  const [burstWindowHours, setBurstWindowHours] = useState(persistedSession.user?.burstWindowHours ?? 5);
  const [weeklyCreditsUsed, setWeeklyCreditsUsed] = useState(persistedSession.user?.weeklyCreditsUsed ?? 0);
  const [weeklyCreditsCap, setWeeklyCreditsCap] = useState(persistedSession.user?.weeklyCreditsCap ?? 0);
  const [weeklyCreditsResetAt, setWeeklyCreditsResetAt] = useState<string | null>(persistedSession.user?.weeklyCreditsResetAt ?? null);
  const [onboardingComplete, setOnboardingComplete] = useState(persistedSession.onboardingComplete);
  const [pcSetupComplete, setPcSetupComplete] = useState(persistedSession.pcSetupComplete);
  const [pcSetupSkipped, setPcSetupSkipped] = useState(persistedSession.pcSetupSkipped);
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
  const [desktopPermissionMode, setDesktopPermissionMode] = useState<DesktopPermissionMode>(initialAppState.desktopPermissionMode);
  const [rememberedDesktops, setRememberedDesktops] = useState<AppState["rememberedDesktops"]>(persistedSession.rememberedDesktops);
  const [machineName, setMachineName] = useState("Vibyra Desktop");
  const [projects, setProjects] = useState(starterProjects);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedModel, setSelectedModel] = useState<AppState["selectedModel"]>(initialAppState.selectedModel);
  const [selectedChatModel, setSelectedChatModel] = useState(persistedSession.selectedChatModel);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [agents, setAgents] = useState(starterAgents);
  const [logs, setLogs] = useState(starterLogs);
  const [files, setFiles] = useState(starterFiles);
  const [changes, setChanges] = useState(starterChanges);
  const [selectedFileId, setSelectedFileId] = useState("empty");
  const [buildState, setBuildState] = useState<AppState["buildState"]>("idle");
  const [previewState, setPreviewState] = useState<AppState["previewState"]>("offline");
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [lastPrompt, setLastPrompt] = useState("");
  const [agentRequesting, setAgentRequesting] = useState(false);
  const [taskText, setTaskText] = useState("");
  const [chatThreads, setChatThreads] = useState<Record<string, ChatMessage[]>>(initialAppState.chatThreads);
  const [chatTitles, setChatTitles] = useState<Record<string, string>>(initialAppState.chatTitles);
  const [detachedChatThreads, setDetachedChatThreads] = useState<Record<string, ChatMessage[]>>(initialAppState.detachedChatThreads);
  const [detachedChatTitles, setDetachedChatTitles] = useState<Record<string, string>>(initialAppState.detachedChatTitles);
  const [detachedChatUpdatedAt, setDetachedChatUpdatedAt] = useState<Record<string, number>>(initialAppState.detachedChatUpdatedAt);
  const [newFilePath, setNewFilePath] = useState("note.txt");
  const [command, setCommand] = useState("npm run build");
  const [promptMoney, setPromptMoney] = useState<AppState["promptMoney"]>(initialAppState.promptMoney);

  const [chatSkills, setChatSkills] = useState<import("../utils/appApi").ChatSkill[]>([]);
  const [chatProjects, setChatProjects] = useState<Record<string, import("../types/domain").Project>>(initialAppState.chatProjects);
  const [projectMemories, setProjectMemories] = useState<Record<string, import("../types/domain").ProjectMemory>>(initialAppState.projectMemories);
  const [editApprovals, setEditApprovals] = useState<Record<string, "always">>(initialAppState.editApprovals);

  useEffect(() => {
    let cancelled = false;
    loadPersistedSession()
      .then((session) => {
        if (cancelled) return;
        const persisted = getPersistedAppState(session);
        setAuthenticated(Boolean(session.authToken && session.user));
        setAuthToken(session.authToken);
        setInstallId(session.installId);
        setAccountId(session.user?.id ?? null);
        setAccountPlan(session.user?.plan ?? "free");
        setLevelProgress(session.user?.level);
        setAuthName(session.user?.name ?? "");
        setAuthEmail(session.user?.email ?? "");
        setProfileImageUri(persisted.profileImageUri);
        setCreditsBalance(session.user?.creditsBalance ?? 0);
        setCreditsUsed(session.user?.creditsUsed ?? 0);
        setDailyCreditsUsed(session.user?.dailyCreditsUsed ?? 0);
        setDailyCreditsCap(session.user?.dailyCreditsCap ?? 0);
        setDailyCreditsResetAt(session.user?.dailyCreditsResetAt ?? null);
        setBurstCreditsUsed(session.user?.burstCreditsUsed ?? 0);
        setBurstCreditsCap(session.user?.burstCreditsCap ?? 0);
        setBurstCreditsResetAt(session.user?.burstCreditsResetAt ?? null);
        setBurstWindowHours(session.user?.burstWindowHours ?? 5);
        setWeeklyCreditsUsed(session.user?.weeklyCreditsUsed ?? 0);
        setWeeklyCreditsCap(session.user?.weeklyCreditsCap ?? 0);
        setWeeklyCreditsResetAt(session.user?.weeklyCreditsResetAt ?? null);
        setOnboardingComplete(session.onboardingComplete);
        setPcSetupComplete(session.pcSetupComplete);
        setPcSetupSkipped(session.pcSetupSkipped);
        setRememberedDesktops(session.rememberedDesktops);
        setSelectedChatModel(session.selectedChatModel);
        setDesktopPermissionMode(persisted.desktopPermissionMode);
        setSelectedModel(persisted.selectedModel);
        setChatThreads(persisted.chatThreads);
        setChatTitles(persisted.chatTitles);
        setDetachedChatThreads(persisted.detachedChatThreads);
        setDetachedChatTitles(persisted.detachedChatTitles);
        setDetachedChatUpdatedAt(persisted.detachedChatUpdatedAt);
        setChatProjects(persisted.chatProjects);
        setProjectMemories(persisted.projectMemories);
        setEditApprovals(persisted.editApprovals);
        setPromptMoney(persisted.promptMoney);
      })
      .finally(() => {
        if (!cancelled) setPersistenceReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setProjects((current) => {
      const known = new Set(current.map((p) => p.id));
      const additions = Object.values(chatProjects).filter((p) => p && !known.has(p.id));
      return additions.length > 0 ? [...additions, ...current] : current;
    });
  }, [chatProjects]);

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
    if (!persistenceReady) return;
    void savePersistedSession({
      authToken,
      installId,
      onboardingComplete,
      pcSetupComplete,
      pcSetupSkipped,
      selectedChatModel,
      rememberedDesktops,
      user: accountId ? {
        id: accountId,
        name: authName || "Vibyra User",
        email: authEmail,
        plan: accountPlan,
        planBillingCycle: "monthly",
        planRenewsAt: null,
        creditsBalance,
        creditsUsed,
        dailyCreditsUsed,
        dailyCreditsCap,
        dailyCreditsResetAt,
        burstCreditsUsed,
        burstCreditsCap,
        burstCreditsResetAt,
        burstWindowHours,
        weeklyCreditsUsed,
        weeklyCreditsCap,
        weeklyCreditsResetAt,
        monthlyCredits: 0,
        allowedModelTiers: [],
        level: levelProgress,
        onboardingComplete,
        rememberedDesktops,
        appState: { chatThreads, chatTitles, detachedChatThreads, detachedChatTitles, detachedChatUpdatedAt, chatProjects, projectMemories, editApprovals, profileImageUri, selectedModel, selectedChatModel, desktopPermissionMode, promptMoney }
      } : null
    });
  }, [
    accountId, accountPlan, authEmail, authName, authToken, chatThreads, chatTitles, detachedChatThreads, detachedChatTitles, detachedChatUpdatedAt, chatProjects,
    projectMemories, editApprovals, creditsBalance, creditsUsed, dailyCreditsUsed, dailyCreditsCap, dailyCreditsResetAt,
    burstCreditsUsed, burstCreditsCap, burstCreditsResetAt, burstWindowHours, weeklyCreditsUsed, weeklyCreditsCap, weeklyCreditsResetAt, installId, levelProgress, onboardingComplete,
    pcSetupComplete, pcSetupSkipped, persistenceReady, profileImageUri, promptMoney, rememberedDesktops, selectedChatModel, selectedModel, desktopPermissionMode
  ]);

  const derived: AppDerivedState = useMemo(() => {
    const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? emptyProject;
    const explicitFile = files.find((file) => file.id === selectedFileId);
    const fallbackFile = files.find((file) => !isRunArtifact(file)) ?? files[0];
    const selectedFile = explicitFile ?? fallbackFile ?? emptyFile;
    return {
      selectedProject,
      selectedFile,
      activeAgents: agents.filter((agent) => agent.state === "running" || agent.state === "waiting"),
      latestOutput: logs[0]?.message ?? "No output yet"
    };
  }, [agents, files, logs, projects, selectedFileId, selectedProjectId]);

  return {
    state: {
      persistenceReady, authenticated, authToken, installId, accountId, accountPlan, authMode,
      levelProgress,
      authName, authEmail, authPassword, authReferralCode, profileImageUri, creditsBalance, creditsUsed, dailyCreditsUsed, dailyCreditsCap,
      dailyCreditsResetAt, burstCreditsUsed, burstCreditsCap, burstCreditsResetAt, burstWindowHours, weeklyCreditsUsed, weeklyCreditsCap, weeklyCreditsResetAt, onboardingComplete,
      pcSetupComplete, pcSetupSkipped, paired, agentUrl, pairCode, pairing, pairingError, pairingMessage,
      healthMessage, checkingHealth, pendingPhoneApproval, connection, desktopPermissionMode, rememberedDesktops,
      machineName, projects, selectedProjectId, selectedModel, selectedChatModel, reasoningEffort,
      agents, logs, files, changes, selectedFileId, buildState, previewState,
      workflowIndex, lastPrompt, agentRequesting, taskText, chatMessages, chatThreads, chatTitles, detachedChatThreads, detachedChatTitles, detachedChatUpdatedAt,
      chatSkills, chatProjects, projectMemories, editApprovals, newFilePath, command, promptMoney
    },
    derived,
    setters: {
      setAuthenticated, setAuthToken, setAccountId, setAccountPlan, setAuthMode,
      setLevelProgress, setAuthName, setAuthEmail, setAuthPassword, setAuthReferralCode, setProfileImageUri, setCreditsBalance, setCreditsUsed,
      setDailyCreditsUsed, setDailyCreditsCap, setDailyCreditsResetAt, setBurstCreditsUsed, setBurstCreditsCap, setBurstCreditsResetAt,
      setBurstWindowHours, setWeeklyCreditsUsed, setWeeklyCreditsCap, setWeeklyCreditsResetAt,
      setOnboardingComplete, setPcSetupComplete, setPcSetupSkipped, setPaired, setAgentUrl, setPairCode, setPairing, setPairingError,
      setPairingMessage, setHealthMessage, setCheckingHealth, setPendingPhoneApproval, setConnection, setDesktopPermissionMode,
      setRememberedDesktops, setMachineName, setProjects,
      setSelectedProjectId, setSelectedModel, setSelectedChatModel, setReasoningEffort, setAgents,
      setLogs, setFiles, setChanges, setSelectedFileId, setBuildState, setPreviewState, setWorkflowIndex,
      setLastPrompt, setAgentRequesting, setTaskText, setChatMessages, setChatThreads, setChatTitles, setDetachedChatThreads, setDetachedChatTitles, setDetachedChatUpdatedAt,
      setChatSkills, setChatProjects, setProjectMemories, setEditApprovals, setNewFilePath, setCommand, setPromptMoney
    }
  };
}
