import { useCallback, useEffect } from "react";
import { Linking } from "react-native";
import { Project } from "../../../types/domain";
import {
  currentProjectReply,
  desktopConnectionRequiredReply,
  desktopProjectSearchQuery,
  isCurrentProjectQuestion,
  isProjectLookupOnly,
  projectPreviewUrl
} from "../helpers/chatPrompts";
import { DashboardPage, DesktopCandidate } from "../types";
import { WorkspaceState } from "./useWorkspaceState";

export function useWorkspaceActions(s: WorkspaceState) {
  const { app } = s;

  const openPcSwitcher = useCallback(() => s.setPcSwitcherVisible(true), [s]);
  const scanDesktops = useCallback(async () => {
    s.setSwitcherScanning(true);
    s.setDesktopCandidates(await app.discoverPairableDesktops());
    s.setSwitcherScanning(false);
  }, [app, s]);
  const connectToDesktop = useCallback(async (d: DesktopCandidate) => { await app.pairMachineAt(d.url, d.pairCode); }, [app]);
  const connectWithCode = useCallback(async () => { await app.pairMachine(); }, [app]);
  const confirmPcSwitch = useCallback(() => { app.confirmPhonePermission(); s.setPcSwitcherVisible(false); }, [app, s]);

  const openProjectChat = useCallback((projectId: string, projectName: string) => {
    const chatId = `project-${projectId}`;
    const title = app.chatTitles[projectId] ?? projectName;
    s.setProjectChatTitles((c) => ({ ...c, [chatId]: title }));
    s.setSelectedChatId(chatId);
    s.setActivePage("chat");
  }, [app.chatTitles, s]);

  useEffect(() => {
    if (s.activePage !== "chat" || !s.selectedChatId?.startsWith("project-")) return;
    const selectedChatProjectId = s.selectedChatId.replace("project-", "");
    const selectedChatProject = app.projects.find((project) => project.id === selectedChatProjectId);
    if (!selectedChatProject) return;
    s.setProjectChatTitles((c) => ({
      ...c,
      [s.selectedChatId!]: app.chatTitles[selectedChatProjectId] ?? selectedChatProject.name
    }));
  }, [s.activePage, app.chatTitles, app.selectedProject.id, app.selectedProject.name, s.currentProjectChatId, s.selectedChatId]);

  const openNewChat = useCallback(() => { s.setSelectedChatId(null); s.setNewChatMessages([]); app.setTaskText(""); s.setActivePage("chat"); }, [app, s]);
  const navigatePage = useCallback((page: DashboardPage) => { if (page === "chat") { openNewChat(); return; } s.setActivePage(page); }, [openNewChat, s]);

  const addDetachedChatReply = useCallback((prompt: string, reply: string) => {
    s.setNewChatMessages((c) => [
      ...c,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: prompt },
      { id: `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "assistant", text: reply }
    ]);
    app.setTaskText("");
  }, [app, s]);

  const openProjectPreview = useCallback(async (projectId: string, projectName: string) => {
    await app.selectProject(projectId);
    if (!app.connection) { openProjectChat(projectId, projectName); return; }
    const url = projectPreviewUrl(app.connection.url, projectId, app.connection.token);
    try { await Linking.openURL(url); } catch { openProjectChat(projectId, projectName); }
  }, [app, openProjectChat]);

  const createProjectAndOpenChat = useCallback(async () => {
    const project = await app.createProject();
    if (!project) return;
    openProjectChat(project.id, app.chatTitles[project.id] ?? project.name);
  }, [app, openProjectChat]);

  const promptReferencesPcFolder = useCallback((prompt: string) => {
    const text = prompt.toLowerCase();
    if (/(on|in)\s+(my\s+)?(desktop|pc|computer|mac|machine)/.test(text)) return true;
    if (/(open|find|use|locate|look\s+(at|in)|switch\s+to|start\s+(coding|working)\s+(on|in)|work\s+(on|in))\s+(the\s+)?[\w\- .]+\s+(folder|repo|repository|project|directory|app|codebase)/.test(text)) return true;
    if (/(the|my)\s+[\w\- .]+\s+(folder|repo|repository|project|directory|app|codebase)\b/.test(text)) return true;
    return false;
  }, []);

  const activeProjectTarget = useCallback((project?: Project) => {
    const selectedChatProjectId = s.selectedChatId?.startsWith("project-")
      ? s.selectedChatId.replace("project-", "")
      : null;
    const targetProject = project
      ?? (selectedChatProjectId ? app.projects.find((item) => item.id === selectedChatProjectId) : null)
      ?? app.selectedProject;
    const useSelectedFile = targetProject.id === app.selectedProject.id ? app.selectedFile : null;

    return {
      project: targetProject,
      projectId: targetProject.id,
      chatProjectId: targetProject.id,
      file: useSelectedFile
    };
  }, [app.projects, app.selectedFile, app.selectedProject, s.selectedChatId]);

  const onStartChat = useCallback(async () => {
    const prompt = app.taskText.trim();
    if (!prompt) return;
    const detached = s.selectedChatId === null;
    const reply = (r: string, project?: Project) => detached ? addDetachedChatReply(prompt, r) : app.addLocalChatReply(prompt, r, activeProjectTarget(project));
    if (isCurrentProjectQuestion(prompt)) {
      const target = activeProjectTarget();
      reply(detached ? "This is a new chat with no project attached yet. Open a folder from Projects, or ask me to find a folder on your PC." : currentProjectReply(target.project, target.file?.name ?? "No file selected"));
      return;
    }
    const refs = promptReferencesPcFolder(prompt);
    if (!app.connection && refs) { reply(desktopConnectionRequiredReply(desktopProjectSearchQuery(prompt))); return; }
    if (!refs) {
      if (detached) { addDetachedChatReply(prompt, "Start by opening a project, or ask me to find a folder on your PC. I will keep this new chat blank until a project is attached."); return; }
      await app.startAgent(activeProjectTarget()); return;
    }
    const q = desktopProjectSearchQuery(prompt);
    const matches = await app.searchDesktopFolders(q);
    if (matches.length === 0) { reply(`I couldn't find a desktop project matching "${q}". Try opening the Projects tab or use a more exact folder name.`); return; }
    const onTop = matches[0]?.path && matches[0].path === app.selectedProject?.path;
    if (onTop) { if (isProjectLookupOnly(prompt)) { app.addLocalChatReply(prompt, `${matches[0].name} is already the selected project.`, activeProjectTarget(matches[0])); return; } await app.startAgent(activeProjectTarget(matches[0])); return; }
    if (isProjectLookupOnly(prompt)) {
      await app.adoptProject(matches[0]);
      s.setSelectedChatId(`project-${matches[0].id}`);
      app.addLocalChatReply(prompt, `Found ${matches[0].name} and selected it for this chat.`, activeProjectTarget(matches[0]));
      return;
    }
    s.setFolderConfirm({ query: prompt, matches });
  }, [activeProjectTarget, addDetachedChatReply, app, promptReferencesPcFolder, s]);

  const acceptFolderConfirm = useCallback(async (folder: Project) => {
    s.setFolderConfirm(null);
    await app.adoptProject(folder);
    s.setSelectedChatId(`project-${folder.id}`);
    await app.startAgent(activeProjectTarget(folder));
  }, [activeProjectTarget, app, s]);
  const skipFolderConfirm = useCallback(async () => { s.setFolderConfirm(null); await app.startAgent(activeProjectTarget()); }, [activeProjectTarget, app, s]);
  const cancelFolderConfirm = useCallback(() => s.setFolderConfirm(null), [s]);
  const openRenameChat = useCallback(() => { s.setRenameChatDraft(s.chatTitle); s.setRenameChatVisible(true); }, [s]);

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
      s.setNewChatMessages([]); app.setTaskText(""); return;
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
    openPcSwitcher, scanDesktops, connectToDesktop, connectWithCode, confirmPcSwitch,
    navigatePage, openProjectPreview, createProjectAndOpenChat,
    onStartChat, acceptFolderConfirm, skipFolderConfirm, cancelFolderConfirm,
    openRenameChat, saveRenameChat, deleteCurrentChat, backFromCommunitySubPage
  };
}
