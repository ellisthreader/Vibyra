import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppContext } from "../../../context/AppContext";
import { ChatMessage, GeneratedApp, Project } from "../../../types/domain";
import { previousChats, tokenMembership } from "../data/pages";
import { getCurrentDesktopPairCode } from "../inline";
import { CommunityPost, DashboardPage, DesktopCandidate, SettingsTab } from "../types";

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;

export function useWorkspaceState() {
  const app = useAppContext();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 420;
  const [activePage, setActivePage] = useState<DashboardPage>("dashboard");
  const [desktopCandidates, setDesktopCandidates] = useState<DesktopCandidate[]>(app.rememberedDesktops);
  const [pcSwitcherVisible, setPcSwitcherVisible] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [switcherScanning, setSwitcherScanning] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [newChatMessages, setNewChatMessages] = useState<ChatMessage[]>([]);
  const [chatTitleOverrides, setChatTitleOverrides] = useState<Record<string, string>>({});
  const [renameChatVisible, setRenameChatVisible] = useState(false);
  const [renameChatDraft, setRenameChatDraft] = useState("");
  const [projectChatTitles, setProjectChatTitles] = useState<Record<string, string>>({});
  const [tokenSheetVisible, setTokenSheetVisible] = useState(false);
  const [projectsCanScroll, setProjectsCanScroll] = useState(false);
  const [selectedCommunityPost, setSelectedCommunityPost] = useState<CommunityPost | null>(null);
  const [openedCommunityPostId, setOpenedCommunityPostId] = useState<string | null>(null);
  const [previewApp, setPreviewApp] = useState<GeneratedApp | null>(null);
  const [desktopFolders, setDesktopFolders] = useState<Project[]>([]);
  const [folderConfirm, setFolderConfirm] = useState<{ query: string; matches: Project[] } | null>(null);

  const filteredProjects = useMemo(() => {
    const s = projectSearch.trim().toLowerCase();
    if (!s) return app.projects;
    return app.projects.filter((p) => p.name.toLowerCase().includes(s) || p.path.toLowerCase().includes(s) || p.stack.toLowerCase().includes(s));
  }, [app.projects, projectSearch]);

  const filteredDesktopFolders = useMemo(() => {
    const s = projectSearch.trim().toLowerCase();
    if (!s) return desktopFolders;
    return desktopFolders.filter((f) => f.name.toLowerCase().includes(s) || f.path.toLowerCase().includes(s) || (f.stack ?? "").toLowerCase().includes(s));
  }, [desktopFolders, projectSearch]);

  useEffect(() => {
    if (!app.connection) { setDesktopFolders([]); return; }
    let cancelled = false;
    (async () => { const folders = await app.loadDesktopFolders(); if (!cancelled) setDesktopFolders(folders); })();
    return () => { cancelled = true; };
  }, [app, app.connection]);

  const isConnected = Boolean(app.connection);
  const lastRememberedDesktop = app.rememberedDesktops.find((d) => d.lastConnectedAt) ?? app.rememberedDesktops[0];
  const connectedMachineName = app.connection?.machineName ?? lastRememberedDesktop?.machineName ?? app.machineName;
  const autoReconnectAttempted = useRef(false);

  useEffect(() => {
    if (isConnected || autoReconnectAttempted.current || !lastRememberedDesktop?.lastConnectedAt) return;
    autoReconnectAttempted.current = true;
    let cancelled = false;
    (async () => {
      if (lastRememberedDesktop.token && await app.connectRememberedDesktop(lastRememberedDesktop)) return;
      const code = await getCurrentDesktopPairCode(lastRememberedDesktop.url);
      if (cancelled || !code) return;
      await app.pairMachineAt(lastRememberedDesktop.url, code);
    })();
    return () => { cancelled = true; };
  }, [app, isConnected, lastRememberedDesktop]);

  const tokenBalance = 5;
  const creditAllowance = Math.max(tokenBalance + app.creditsUsed, app.accountPlan === "free" ? 50 : tokenMembership.allowance);
  const creditPercentRemaining = creditAllowance > 0 ? Math.round((tokenBalance / creditAllowance) * 100) : 0;
  const creditsLow = creditAllowance > 0 && tokenBalance / creditAllowance < 0.1;
  const activeChat = previousChats.find((c) => c.id === selectedChatId);
  const selectedChatProjectId = selectedChatId?.startsWith("project-") ? selectedChatId.replace("project-", "") : null;
  const projectChatTitle = selectedChatProjectId ? app.chatTitles[selectedChatProjectId] ?? projectChatTitles[selectedChatId ?? ""] : undefined;
  const currentProjectChatId = `project-${app.selectedProject.id}`;
  const chatTitleKey = selectedChatId ?? "new-chat";
  const chatTitle = chatTitleOverrides[chatTitleKey] ?? activeChat?.title ?? projectChatTitle ?? "New chat";
  const visibleChatMessages = selectedChatId
    ? (selectedChatProjectId ? (app.chatThreads[selectedChatProjectId] ?? []) : app.chatMessages)
    : newChatMessages;

  useEffect(() => { if (app.rememberedDesktops.length > 0) setDesktopCandidates(app.rememberedDesktops); }, [app.rememberedDesktops]);

  return {
    app, height, insets, compact,
    activePage, setActivePage,
    desktopCandidates, setDesktopCandidates,
    pcSwitcherVisible, setPcSwitcherVisible,
    projectSearch, setProjectSearch,
    switcherScanning, setSwitcherScanning,
    settingsTab, setSettingsTab,
    selectedChatId, setSelectedChatId,
    newChatMessages, setNewChatMessages,
    chatTitleOverrides, setChatTitleOverrides,
    renameChatVisible, setRenameChatVisible,
    renameChatDraft, setRenameChatDraft,
    projectChatTitles, setProjectChatTitles,
    tokenSheetVisible, setTokenSheetVisible,
    projectsCanScroll, setProjectsCanScroll,
    selectedCommunityPost, setSelectedCommunityPost,
    openedCommunityPostId, setOpenedCommunityPostId,
    previewApp, setPreviewApp,
    folderConfirm, setFolderConfirm,
    filteredProjects, filteredDesktopFolders,
    isConnected, connectedMachineName,
    tokenBalance, creditPercentRemaining, creditsLow,
    chatTitle, chatTitleKey, currentProjectChatId, visibleChatMessages
  };
}
