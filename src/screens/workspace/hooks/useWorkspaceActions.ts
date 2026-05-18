import { useCallback, useEffect } from "react";
import type { DesktopConnectionPrompt } from "../../../types/domain";
import { makeId, wait } from "../../../utils/ids";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import { DashboardPage, DesktopCandidate } from "../types";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import { useWorkspaceFolderActions } from "./workspaceFolderActions";
import { useWorkspacePromptActions } from "./workspacePromptActions";

export function useWorkspaceActions(s: WorkspaceState) {
  const { app } = s;
  const runtime = useWorkspaceChatRuntime(s);
  const prompt = useWorkspacePromptActions(s, runtime);
  const folderActions = useWorkspaceFolderActions(s, runtime, prompt.folderRecoveryRef);

  const updateConnectionStage = useCallback((messageId: string, stage: NonNullable<DesktopConnectionPrompt["stage"]>, projectId?: string) => {
    const update = { stage };
    if (!projectId) s.setNewChatMessages((c) => c.map((m) => m.id === messageId && m.desktopConnection ? { ...m, desktopConnection: { ...m.desktopConnection, ...update } } : m));
    else app.updateDesktopConnectionPrompt(messageId, update, projectId);
  }, [app, s]);
  const rememberDesktopIntent = useCallback((messageId?: string, connectionPrompt?: DesktopConnectionPrompt) => {
    const query = connectionPrompt?.query?.trim() ?? "";
    if (!query || !messageId) return;
    const projectId = connectionPrompt?.projectId ?? sourceProjectId(s);
    const action = connectionPrompt?.reason === "desktop-browse" && projectId ? "analyze-project" : "search";
    updateConnectionStage(messageId, "pair", projectId);
    s.setPendingDesktopFolderIntent({ action, query, detached: !projectId, messageId, ...(projectId ? { projectId } : {}) });
  }, [s, updateConnectionStage]);
  const openPcSwitcher = useCallback((messageId?: string, connectionPrompt?: DesktopConnectionPrompt) => {
    rememberDesktopIntent(messageId, connectionPrompt);
    s.setPcSwitcherVisible(true);
  }, [rememberDesktopIntent, s]);
  const openPcSearch = useCallback(async (messageId?: string, connectionPrompt?: DesktopConnectionPrompt) => {
    rememberDesktopIntent(messageId, connectionPrompt);
    s.setPcSwitcherVisible(true);
    s.setSwitcherScanning(true);
    try {
      s.setDesktopCandidates(await app.discoverPairableDesktops());
    } finally {
      s.setSwitcherScanning(false);
    }
  }, [app, rememberDesktopIntent, s]);
  const scanDesktops = useCallback(async () => {
    s.setSwitcherScanning(true);
    s.setDesktopCandidates(await app.discoverPairableDesktops());
    s.setSwitcherScanning(false);
  }, [app, s]);
  const connectToDesktop = useCallback(async (d: DesktopCandidate) => { await app.pairMachineAt(d.url, ""); }, [app]);
  const connectWithCode = useCallback(async () => { await app.pairMachine(); }, [app]);
  const confirmPcSwitch = useCallback(() => { app.confirmPhonePermission(); s.setPcSwitcherVisible(false); }, [app, s]);
  const disconnectPc = useCallback(() => { app.disconnectDesktop(); s.setPcSwitcherVisible(false); }, [app, s]);
  const closePcSwitcher = useCallback(() => {
    s.setPendingDesktopFolderIntent(null);
    s.setPcSwitcherVisible(false);
  }, [s]);

  useEffect(() => {
    if (!app.connection || !s.pendingDesktopFolderIntent) return;
    const intent = s.pendingDesktopFolderIntent;
    s.setPendingDesktopFolderIntent(null);
    s.setPcSwitcherVisible(false);
    s.setActivePage("chat");
    if (intent.detached) s.setSelectedChatId(null);
    else if (intent.projectId) s.setSelectedChatId(`project-${intent.projectId}`);
    updateConnectionStage(intent.messageId, "open", intent.projectId);
    void (intent.action === "analyze-project" ? analyzeConnectedProject(intent) : replaceConnectionWithFolderProposal(intent));
  }, [app.connection, s, s.pendingDesktopFolderIntent, updateConnectionStage]);

  async function analyzeConnectedProject(intent: NonNullable<WorkspaceState["pendingDesktopFolderIntent"]>) {
    await wait(450);
    const project = intent.projectId ? app.projects.find((item) => item.id === intent.projectId) ?? app.chatProjects[intent.projectId] : null;
    if (!project) {
      await replaceConnectionWithFolderProposal({ ...intent, action: "search" });
      return;
    }
    replaceConnectionWithReply(intent, `Connected to your PC. Checking the framework and app type for **${project.name}**...`);
    const analyzed = await runFirstOpenDesktopAnalysis(app, project);
    await app.adoptProject(analyzed);
  }

  async function replaceConnectionWithFolderProposal(intent: NonNullable<WorkspaceState["pendingDesktopFolderIntent"]>) {
    await wait(450);
    const matches = await app.searchDesktopFolders(intent.query);
    if (matches.length === 0) {
      replaceConnectionWithReply(intent, `I connected to your PC, but couldn't find a folder matching "${intent.query}". Try the exact folder name, or use Scan Wi-Fi to refresh the desktop connection.`);
      return;
    }
    const top = matches[0];
    const reply = matches.length > 1
      ? `I found ${matches.length} folders matching "${intent.query}". Open ${top.name}?`
      : `Found ${top.name} on your desktop. Open it for this chat?`;
    if (intent.detached) {
      s.setNewChatMessages((c) => c.map((m) => {
        if (m.id !== intent.messageId) return m;
        const { desktopConnection: _desktopConnection, ...rest } = m;
        return { ...rest, text: reply, folderProposal: { id: makeId("proposal"), status: "pending", matches, selectedIndex: 0, query: intent.query } };
      }));
      return;
    }
    app.replaceDesktopConnectionWithProposal(intent.messageId, reply, matches, intent.query, intent.projectId);
  }

  function replaceConnectionWithReply(intent: NonNullable<WorkspaceState["pendingDesktopFolderIntent"]>, reply: string) {
    if (intent.detached) {
      s.setNewChatMessages((c) => c.map((m) => {
        if (m.id !== intent.messageId) return m;
        const { desktopConnection: _desktopConnection, ...rest } = m;
        return { ...rest, text: reply };
      }));
      return;
    }
    app.replaceDesktopConnectionWithProposal(intent.messageId, reply, [], intent.query, intent.projectId);
  }

  useEffect(() => {
    if (s.activePage !== "chat" || !s.selectedChatId?.startsWith("project-")) return;
    const selectedChatProjectId = s.selectedChatId.replace("project-", "");
    const selectedChatProject = app.projects.find((project) => project.id === selectedChatProjectId);
    if (!selectedChatProject) return;
    s.setProjectChatTitles((c) => ({
      ...c,
      [s.selectedChatId!]: app.chatTitles[selectedChatProjectId] ?? selectedChatProject.name
    }));
  }, [s.activePage, app.chatTitles, app.projects, app.selectedProject.id, app.selectedProject.name, s.currentProjectChatId, s.selectedChatId]);

  const openNewChat = useCallback(() => {
    s.setSelectedChatId(null);
    s.setNewChatMessages([]);
    app.setTaskText("");
    s.setActivePage("chat");
  }, [app, s]);

  const navigatePage = useCallback((page: DashboardPage) => {
    if (page === "chat") { openNewChat(); return; }
    s.setActivePage(page);
  }, [openNewChat, s]);

  const submitPreviewEdit = useCallback(async (prompt: string) => {
    const target = runtime.activeProjectTarget();
    runtime.openProjectChat(target.chatProjectId, target.project.name);
    return app.startAgent(target, prompt);
  }, [app, runtime]);

  const openTestPreview = useCallback(async (userText: string) => {
    if (await runtime.openRunnablePreview()) return;
    const target = runtime.activeProjectTarget();
    app.addLocalChatReply(userText, `I couldn't find a runnable preview for **${target.project.name}** yet. Build something first, then run **/preview** again.`, target);
  }, [app, runtime]);

  const openRenameChat = useCallback(() => {
    s.setRenameChatDraft(s.chatTitle);
    s.setRenameChatVisible(true);
  }, [s]);

  const saveRenameChat = useCallback(() => {
    const next = s.renameChatDraft.trim();
    if (next) {
      s.setChatTitleOverrides((c) => ({ ...c, [s.chatTitleKey]: next }));
      if (s.selectedChatId?.startsWith("project-")) s.setProjectChatTitles((c) => ({ ...c, [s.selectedChatId!]: next }));
    }
    s.setRenameChatVisible(false);
  }, [s]);

  const deleteCurrentChat = useCallback(() => {
    if (!s.selectedChatId) {
      s.setChatTitleOverrides((c) => { const n = { ...c }; delete n["new-chat"]; return n; });
      s.setNewChatMessages([]);
      app.setTaskText("");
      return;
    }
    s.setChatTitleOverrides((c) => { const n = { ...c }; delete n[s.chatTitleKey]; return n; });
    s.setProjectChatTitles((c) => { const n = { ...c }; delete n[s.selectedChatId!]; return n; });
    app.clearCurrentChat(s.selectedChatId.replace("project-", ""));
  }, [app, s]);

  const backFromCommunitySubPage = useCallback(() => {
    if (s.openedCommunityPostId) { s.setOpenedCommunityPostId(null); return; }
    s.setSelectedCommunityPost(null);
  }, [s]);

  return {
    openPcSwitcher,
    openPcSearch,
    scanDesktops,
    connectToDesktop,
    connectWithCode,
    confirmPcSwitch,
    closePcSwitcher,
    disconnectPc,
    navigatePage,
    openProjectPreview: runtime.openProjectPreview,
    openRunnablePreview: runtime.openRunnablePreview,
    openTestPreview,
    createProjectAndOpenChat: runtime.createProjectAndOpenChat,
    onStartChat: prompt.onStartChat,
    onApprovePreviewServerStart: prompt.approvePreviewServerStart,
    onDenyPreviewServerStart: prompt.denyPreviewServerStart,
    submitPreviewEdit,
    ...folderActions,
    openRenameChat,
    saveRenameChat,
    deleteCurrentChat,
    backFromCommunitySubPage
  };
}

function sourceProjectId(s: WorkspaceState) {
  return s.selectedChatId?.startsWith("project-") ? s.selectedChatId.replace("project-", "") : undefined;
}
