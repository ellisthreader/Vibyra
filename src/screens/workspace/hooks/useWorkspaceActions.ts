import { useCallback, useEffect, useRef } from "react";
import { FolderRecovery, GeneratedApp, Project } from "../../../types/domain";
import {
  bareNameCandidate,
  currentProjectReply,
  desktopConnectionRequiredReply,
  extractFileName,
  extractFolderName,
  isCurrentProjectQuestion,
  isFindFolderIntent,
  isOpenFileIntent,
  isProjectLookupOnly,
  projectPreviewUrl
} from "../helpers/chatPrompts";
import {
  bareNameClarifyReply,
  confusionReply,
  createProjectReply,
  detachedFallbackReply,
  greetingReply,
  helpReply,
  isConfusion,
  isCreateProjectIntent,
  isGreeting,
  isHelpRequest,
  isPreviewTroubleIntent,
  isSmallTalk,
  isViewPreviewIntent,
  previewNeedsProjectReply,
  previewNotConnectedReply,
  previewOpeningReply,
  previewTroubleReply,
  smallTalkReply
} from "../helpers/chatReplies";
import { DashboardPage, DesktopCandidate } from "../types";
import { WorkspaceState } from "./useWorkspaceState";
import { streamChatText, TYPING_CURSOR } from "../../../utils/chatStream";

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
    const assistantId = `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    s.setNewChatMessages((c) => [
      ...c,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: prompt },
      { id: assistantId, role: "assistant", text: TYPING_CURSOR }
    ]);
    app.setTaskText("");
    streamChatText(reply, (text) => {
      s.setNewChatMessages((c) => c.map((m) => (m.id === assistantId ? { ...m, text } : m)));
    });
  }, [app, s]);

  const addDetachedChatProposal = useCallback((prompt: string, reply: string, matches: Project[], query: string) => {
    const proposalId = `new-chat-proposal-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const assistantId = `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    s.setNewChatMessages((c) => [
      ...c,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: prompt },
      {
        id: assistantId,
        role: "assistant",
        text: TYPING_CURSOR,
        folderProposal: { id: proposalId, status: "pending", matches, selectedIndex: 0, query }
      }
    ]);
    app.setTaskText("");
    streamChatText(reply, (text) => {
      s.setNewChatMessages((c) => c.map((m) => (m.id === assistantId ? { ...m, text } : m)));
    });
  }, [app, s]);

  const desktopPreviewApp = useCallback((projectId: string, projectName: string): GeneratedApp | null => {
    if (!app.connection) return null;
    return {
      id: `desktop-preview-${projectId}`,
      title: projectName,
      url: projectPreviewUrl(app.connection.url, projectId, app.connection.token)
    };
  }, [app.connection]);

  const openProjectPreview = useCallback(async (projectId: string, projectName: string) => {
    const known = app.projects.some((p) => p.id === projectId);
    openProjectChat(projectId, projectName);
    if (known) await app.selectProject(projectId);
    if (app.connection && known) {
      const preview = desktopPreviewApp(projectId, projectName);
      if (preview) s.setPreviewApp(preview);
    }
  }, [app, desktopPreviewApp, openProjectChat, s]);

  const createProjectAndOpenChat = useCallback(async () => {
    const project = await app.createProject();
    if (!project) return;
    openProjectChat(project.id, app.chatTitles[project.id] ?? project.name);
  }, [app, openProjectChat]);

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

  const awaitingFolderNameRef = useRef(false);
  const folderRecoveryRef = useRef(false);
  const submitLockRef = useRef(false);

  const runFolderSearch = useCallback(async (prompt: string, query: string, lookupOnly: boolean, detached: boolean) => {
    const reply = (r: string, project?: Project, preview?: GeneratedApp) => detached
      ? addDetachedChatReply(prompt, r)
      : app.addLocalChatReply(prompt, r, activeProjectTarget(project), preview);

    const matches = await app.searchDesktopFolders(query);
    if (matches.length === 0) {
      reply(`I couldn't find a folder matching "${query}". Try the exact folder name, or open the Projects tab to browse.`);
      return;
    }
    const onTop = matches[0]?.path && matches[0].path === app.selectedProject?.path;
    if (onTop) {
      if (lookupOnly) {
        app.addLocalChatReply(prompt, `${matches[0].name} is already the selected project.`, activeProjectTarget(matches[0]));
        return;
      }
      await app.startAgent(activeProjectTarget(matches[0]));
      return;
    }
    if (lookupOnly || detached) {
      const top = matches[0];
      const replyText = matches.length > 1
        ? `I found ${matches.length} folders matching "${query}". Open ${top.name}?`
        : `Found ${top.name} on your desktop. Open it for this chat?`;
      if (detached) {
        addDetachedChatProposal(prompt, replyText, matches, query);
      } else {
        app.addLocalChatProposal(prompt, replyText, matches, activeProjectTarget(), query);
      }
      return;
    }
    s.setFolderConfirm({ query: prompt, matches });
  }, [activeProjectTarget, addDetachedChatProposal, addDetachedChatReply, app, s]);

  const runFileOpen = useCallback(async (prompt: string, query: string, detached: boolean) => {
    const reply = (r: string, project?: Project, preview?: GeneratedApp) => detached
      ? addDetachedChatReply(prompt, r)
      : app.addLocalChatReply(prompt, r, activeProjectTarget(project), preview);

    if (!app.connection) {
      reply(desktopConnectionRequiredReply(query));
      return;
    }
    if (detached) {
      reply(`I can open "${query}", but first attach a project chat. Ask me to find the folder on your PC, then open the file from that project.`);
      return;
    }

    const target = activeProjectTarget();
    const normalized = query.toLowerCase();
    const matches = app.files
      .filter((file) => file.id !== "empty")
      .filter((file) => file.name.toLowerCase().includes(normalized) || file.path.toLowerCase().includes(normalized))
      .sort((a, b) => Number(b.name.toLowerCase() === normalized) - Number(a.name.toLowerCase() === normalized));

    const file = matches[0];
    if (!file) {
      reply(`I couldn't find a loaded file matching "${query}" in ${target.project.name}. Open the project first, then try the exact file name or path.`);
      return;
    }

    await app.selectFile(file.id);
    reply(`Opened ${file.path} in ${target.project.name}.`, target.project);
  }, [activeProjectTarget, addDetachedChatReply, app]);

  const onStartChat = useCallback(async () => {
    const prompt = app.taskText.trim();
    if (!prompt) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    const detached = s.selectedChatId === null;
    const reply = (r: string, project?: Project, preview?: GeneratedApp) => detached
      ? addDetachedChatReply(prompt, r)
      : app.addLocalChatReply(prompt, r, activeProjectTarget(project), preview);

    try {
      if (detached) {
        if (isConfusion(prompt)) {
          awaitingFolderNameRef.current = false;
          folderRecoveryRef.current = false;
          addDetachedChatReply(prompt, confusionReply());
          return;
        }
        if (isHelpRequest(prompt)) {
          awaitingFolderNameRef.current = false;
          folderRecoveryRef.current = false;
          addDetachedChatReply(prompt, helpReply());
          return;
        }
        if (isCreateProjectIntent(prompt)) {
          awaitingFolderNameRef.current = false;
          folderRecoveryRef.current = false;
          addDetachedChatReply(prompt, createProjectReply());
          return;
        }
      }

      if (detached && !awaitingFolderNameRef.current) {
        if (isGreeting(prompt)) { addDetachedChatReply(prompt, greetingReply()); return; }
        if (isSmallTalk(prompt)) { addDetachedChatReply(prompt, smallTalkReply()); return; }
      }

      if (folderRecoveryRef.current) {
        const name = extractFolderName(prompt) ?? bareNameCandidate(prompt);
        const looksLikeName = !!name && name.length <= 40 && /^[a-z0-9][\w.-]*$/i.test(name);
        if (!looksLikeName) {
          reply("Type just the folder name, or use Manual search / Auto search PC.");
          return;
        }
        if (/^cancel$/i.test(name)) {
          folderRecoveryRef.current = false;
          reply("Got it — cancelled.");
          return;
        }
        folderRecoveryRef.current = false;
        awaitingFolderNameRef.current = false;
        if (!app.connection) { reply(desktopConnectionRequiredReply(name)); return; }
        await runFolderSearch(prompt, name, true, detached);
        return;
      }

      if (awaitingFolderNameRef.current) {
        const name = extractFolderName(prompt) ?? prompt.replace(/^(?:yes|yeah|yep|ok(?:ay)?|sure|please)\b\s*/i, "").trim();
        const looksLikeName = !!name && name.length <= 40 && /^[a-z0-9][\w.-]*$/i.test(name);
        if (!looksLikeName) {
          reply(`Type just the folder name, like \`test1\`. (Or say "cancel" to drop it.)`);
          return;
        }
        if (/^cancel$/i.test(name)) {
          awaitingFolderNameRef.current = false;
          reply("Got it — cancelled.");
          return;
        }
        awaitingFolderNameRef.current = false;
        if (!app.connection) { reply(desktopConnectionRequiredReply(name)); return; }
        await runFolderSearch(prompt, name, true, detached);
        return;
      }

      if (isCurrentProjectQuestion(prompt)) {
        const target = activeProjectTarget();
        reply(detached
          ? "This is a new chat with no project attached yet. Open a folder from Projects, or ask me to find a folder on your PC."
          : currentProjectReply(target.project, target.file?.name ?? "No file selected"));
        return;
      }

      const findIntent = isFindFolderIntent(prompt);
      const fileIntent = isOpenFileIntent(prompt);
      const extractedFileName = extractFileName(prompt);
      const extractedName = extractFolderName(prompt);

      if (fileIntent) {
        if (!extractedFileName) {
          reply("Which file should I open? Send the exact file name or path, like `App.tsx`.");
          return;
        }
        await runFileOpen(prompt, extractedFileName, detached);
        return;
      }

      if (findIntent && !extractedName) {
        if (!app.connection) { reply(desktopConnectionRequiredReply("")); return; }
        awaitingFolderNameRef.current = true;
        reply("Sure — what's the folder called? Just type the name (e.g. `test1`).");
        return;
      }

      if (findIntent && extractedName) {
        if (!app.connection) { reply(desktopConnectionRequiredReply(extractedName)); return; }
        await runFolderSearch(prompt, extractedName, isProjectLookupOnly(prompt), detached);
        return;
      }

      if (isViewPreviewIntent(prompt)) {
        if (detached) { addDetachedChatReply(prompt, previewNeedsProjectReply()); return; }
        const target = activeProjectTarget();
        if (!app.connection) { reply(previewNotConnectedReply(target.project.name), target.project); return; }
        reply(previewOpeningReply(target.project.name), target.project, desktopPreviewApp(target.projectId, target.project.name) ?? undefined);
        return;
      }

      if (isPreviewTroubleIntent(prompt)) {
        if (detached) { addDetachedChatReply(prompt, previewNeedsProjectReply()); return; }
        const target = activeProjectTarget();
        if (!app.connection) { reply(previewNotConnectedReply(target.project.name), target.project); return; }
        reply(previewTroubleReply(target.project.name), target.project, desktopPreviewApp(target.projectId, target.project.name) ?? undefined);
        return;
      }

      if (detached) {
        const bare = bareNameCandidate(prompt);
        if (bare) {
          if (/^(?:no|nope|nah|not)\b/i.test(prompt)) {
            if (!app.connection) { addDetachedChatReply(prompt, desktopConnectionRequiredReply(bare)); return; }
            await runFolderSearch(prompt, bare, true, true);
            return;
          }
          addDetachedChatReply(prompt, bareNameClarifyReply(bare));
          return;
        }
        addDetachedChatReply(prompt, detachedFallbackReply());
        return;
      }

      await app.startAgent(activeProjectTarget());
    } finally {
      setTimeout(() => {
        submitLockRef.current = false;
      }, 750);
    }
  }, [activeProjectTarget, addDetachedChatReply, app, desktopPreviewApp, openProjectPreview, runFileOpen, runFolderSearch, s]);

  const acceptFolderConfirm = useCallback(async (folder: Project) => {
    s.setFolderConfirm(null);
    await app.adoptProject(folder);
    s.setSelectedChatId(`project-${folder.id}`);
    await app.startAgent(activeProjectTarget(folder));
  }, [activeProjectTarget, app, s]);

  const acceptFolderProposal = useCallback(async (proposalId: string, folder: Project) => {
    if (!s.selectedChatId) {
      s.setNewChatMessages((current) => current.map((message) => (
        message.folderProposal?.id === proposalId
          ? { ...message, folderProposal: { ...message.folderProposal, status: "accepted" } }
          : message
      )));
      await app.adoptProject(folder);
      s.setSelectedChatId(`project-${folder.id}`);
      return;
    }
    const sourceProjectId = s.selectedChatId?.startsWith("project-")
      ? s.selectedChatId.replace("project-", "")
      : app.selectedProject.id;
    app.resolveFolderProposal(proposalId, "accepted", sourceProjectId);
    await app.adoptProject(folder);
    s.setSelectedChatId(`project-${folder.id}`);
  }, [app, s]);

  const addDetachedFolderRecovery = useCallback((recovery: FolderRecovery) => {
    s.setNewChatMessages((current) => [
      ...current,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: "Wrong folder" },
      {
        id: `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        role: "assistant",
        text: "No problem. Should I search your PC again automatically, or do you want to type the folder name?",
        folderRecovery: recovery
      }
    ]);
  }, [s]);

  const wrongFolderProposal = useCallback((proposalId: string, folder: Project, query: string) => {
    const recovery: FolderRecovery = {
      id: `folder-recovery-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      proposalId,
      query: query.trim() || folder.name,
      excludedProjectId: folder.id
    };
    folderRecoveryRef.current = true;
    awaitingFolderNameRef.current = false;

    if (!s.selectedChatId) {
      addDetachedFolderRecovery(recovery);
      return;
    }

    app.addLocalFolderRecovery(
      "Wrong folder",
      "No problem. Should I search your PC again automatically, or do you want to type the folder name?",
      recovery,
      activeProjectTarget()
    );
  }, [activeProjectTarget, addDetachedFolderRecovery, app, s.selectedChatId]);

  const searchFolderProposal = useCallback(async (_proposalId: string, query: string, excludeProjectId?: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const detached = !s.selectedChatId;
    const prompt = excludeProjectId ? "Auto search PC" : `Search PC for ${trimmed}`;
    const reply = (text: string) => detached
      ? addDetachedChatReply(prompt, text)
      : app.addLocalChatReply(prompt, text, activeProjectTarget());

    if (!app.connection) {
      reply(desktopConnectionRequiredReply(trimmed));
      return;
    }

    const matches = await app.searchDesktopFolders(trimmed);
    const filtered = excludeProjectId ? matches.filter((match) => match.id !== excludeProjectId) : matches;
    if (filtered.length > 0) {
      const top = filtered[0];
      const replyText = filtered.length > 1
        ? `I found ${filtered.length} other folders matching "${trimmed}". Open ${top.name}?`
        : `Found another match for "${trimmed}". Open ${top.name} for this chat?`;
      if (detached) {
        addDetachedChatProposal(prompt, replyText, filtered, trimmed);
      } else {
        app.addLocalChatProposal(prompt, replyText, filtered, activeProjectTarget(), trimmed);
      }
      return;
    }

    const error = matches.length > 0
      ? `I only found that same folder for "${trimmed}". Try a more specific name or browse Projects.`
      : `I couldn't find another folder matching "${trimmed}". Try a different name or open Projects to browse.`;
    reply(error);
  }, [activeProjectTarget, addDetachedChatProposal, addDetachedChatReply, app, s.selectedChatId]);

  const dismissFolderProposal = useCallback((proposalId: string) => {
    if (!s.selectedChatId) {
      s.setNewChatMessages((current) => current.map((message) => (
        message.folderProposal?.id === proposalId
          ? { ...message, folderProposal: { ...message.folderProposal, status: "dismissed" } }
          : message
      )));
      return;
    }
    const sourceProjectId = s.selectedChatId?.startsWith("project-")
      ? s.selectedChatId.replace("project-", "")
      : app.selectedProject.id;
    app.resolveFolderProposal(proposalId, "dismissed", sourceProjectId);
  }, [app, s]);
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
    acceptFolderProposal, dismissFolderProposal, searchFolderProposal, wrongFolderProposal,
    openRenameChat, saveRenameChat, deleteCurrentChat, backFromCommunitySubPage
  };
}
