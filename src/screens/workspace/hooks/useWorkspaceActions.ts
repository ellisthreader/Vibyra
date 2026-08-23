import { useCallback, useEffect } from "react";
import { DashboardPage } from "../types";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import { isDetachedChatId } from "./workspaceDetachedChats";
import { useWorkspaceFolderActions } from "./workspaceFolderActions";
import { useWorkspacePreviewLauncher } from "./workspacePreviewLauncher";
import { useWorkspacePromptActions } from "./workspacePromptActions";
import { useWorkspaceDesktopActions } from "./useWorkspaceDesktopActions";

export function useWorkspaceActions(s: WorkspaceState) {
  const { app } = s;
  const runtime = useWorkspaceChatRuntime(s);
  const prompt = useWorkspacePromptActions(s, runtime);
  const folderActions = useWorkspaceFolderActions(s, runtime, prompt.folderRecoveryRef);
  const previewLauncher = useWorkspacePreviewLauncher(s, runtime);
  const desktop = useWorkspaceDesktopActions(s, runtime);

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

  const openRenameChat = useCallback(() => {
    s.setRenameChatDraft(s.chatTitle);
    s.setRenameChatVisible(true);
  }, [s]);

  const saveRenameChat = useCallback(() => {
    const next = s.renameChatDraft.trim();
    if (next) {
      s.setChatTitleOverrides((c) => ({ ...c, [s.chatTitleKey]: next }));
      if (s.selectedChatId?.startsWith("project-")) s.setProjectChatTitles((c) => ({ ...c, [s.selectedChatId!]: next }));
      if (isDetachedChatId(s.selectedChatId)) app.setDetachedChatTitles((c) => ({ ...c, [s.selectedChatId!]: next }));
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
    if (isDetachedChatId(s.selectedChatId)) {
      const chatId = s.selectedChatId;
      app.setDetachedChatThreads((current) => { const next = { ...current }; delete next[chatId]; return next; });
      app.setDetachedChatTitles((current) => { const next = { ...current }; delete next[chatId]; return next; });
      app.setDetachedChatUpdatedAt((current) => { const next = { ...current }; delete next[chatId]; return next; });
      s.setSelectedChatId(null);
      s.setNewChatMessages([]);
      app.setTaskText("");
      return;
    }
    s.setProjectChatTitles((c) => { const n = { ...c }; delete n[s.selectedChatId!]; return n; });
    app.clearCurrentChat(s.selectedChatId.replace("project-", ""));
  }, [app, s]);

  const backFromCommunitySubPage = useCallback(() => {
    if (s.openedCommunityPostId) { s.setOpenedCommunityPostId(null); return; }
    s.setSelectedCommunityPost(null);
  }, [s]);

  return {
    ...desktop,
    navigatePage,
    openProjectPreview: runtime.openProjectPreview,
    openRunnablePreview: previewLauncher.openPreview,
    openTestPreview: previewLauncher.openPreview,
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
