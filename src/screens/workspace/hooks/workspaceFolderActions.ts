import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { FolderRecovery, Project } from "../../../types/domain";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import { isDetachedChatId } from "./workspaceDetachedChats";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;

export function useWorkspaceFolderActions(
  s: WorkspaceState,
  runtime: Runtime,
  folderRecoveryRef: MutableRefObject<boolean>
) {
  const { app } = s;

  const acceptFolderConfirm = useCallback(async (folder: Project) => {
    s.setFolderConfirm(null);
    s.setSelectedChatId(`project-${folder.id}`);
    const analyzed = await runFirstOpenDesktopAnalysis(app, folder);
    await app.adoptProject(analyzed);
    if (!analyzed.briefRequired || analyzed.brief) await app.startAgent(runtime.activeProjectTarget(analyzed));
  }, [app, runtime, s]);

  const acceptFolderProposal = useCallback(async (proposalId: string, folder: Project) => {
    if (!s.selectedChatId || isDetachedChatId(s.selectedChatId)) {
      const target = { project: folder, projectId: folder.id, chatProjectId: folder.id, file: null };
      app.rememberProject(folder);
      app.addLocalChatReply("Open folder", `Opened folder **${folder.name}**.`, target);
      s.setNewChatMessages([]);
      s.setSelectedChatId(`project-${folder.id}`);
      const analyzed = await runFirstOpenDesktopAnalysis(app, folder);
      await app.adoptProject(analyzed);
      return;
    }
    app.resolveFolderProposal(proposalId, "accepted", sourceProjectId(s));
    s.setSelectedChatId(`project-${folder.id}`);
    const analyzed = await runFirstOpenDesktopAnalysis(app, folder);
    await app.adoptProject(analyzed);
  }, [app, runtime, s]);

  const addDetachedFolderRecovery = useCallback((recovery: FolderRecovery) => {
    runtime.appendDetachedMessages("Wrong folder", [
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: "Wrong folder" },
      {
        id: `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        role: "assistant",
        text: "No problem. Should I search your PC again automatically, or do you want to type the folder name?",
        folderRecovery: recovery
      }
    ]);
  }, [runtime]);

  const wrongFolderProposal = useCallback((proposalId: string, folder: Project, query: string) => {
    const recovery: FolderRecovery = { id: `folder-recovery-${Date.now()}-${Math.round(Math.random() * 1000)}`, proposalId, query: query.trim() || folder.name, excludedProjectId: folder.id };
    folderRecoveryRef.current = true;
    if (!s.selectedChatId || isDetachedChatId(s.selectedChatId)) { addDetachedFolderRecovery(recovery); return; }
    app.addLocalFolderRecovery(
      "Wrong folder",
      "No problem. Should I search your PC again automatically, or do you want to type the folder name?",
      recovery,
      runtime.activeProjectTarget()
    );
  }, [addDetachedFolderRecovery, app, folderRecoveryRef, runtime, s.selectedChatId]);

  const searchFolderProposal = useCallback(async (_proposalId: string, query: string, excludeProjectId?: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const detached = !s.selectedChatId || isDetachedChatId(s.selectedChatId);
    const prompt = excludeProjectId ? "Auto search PC" : `Search PC for ${trimmed}`;
    const reply = (text: string) => detached ? runtime.addDetachedChatReply(prompt, text) : app.addLocalChatReply(prompt, text, runtime.activeProjectTarget());
    if (!app.connection) {
      const connectionPrompt = { reason: "desktop-search" as const, query: trimmed };
      detached
        ? runtime.addDetachedDesktopConnectionPrompt(prompt, connectionPrompt)
        : app.addLocalDesktopConnectionPrompt(prompt, connectionPrompt, runtime.activeProjectTarget());
      return;
    }

    const matches = await app.searchDesktopFolders(trimmed);
    const filtered = excludeProjectId ? matches.filter((match) => match.id !== excludeProjectId) : matches;
    if (filtered.length > 0) {
      const top = filtered[0];
      const replyText = filtered.length > 1
        ? `I found ${filtered.length} other folders matching "${trimmed}". Open ${top.name}?`
        : `Found another match for "${trimmed}". Open ${top.name} for this chat?`;
      detached
        ? runtime.addDetachedChatProposal(prompt, replyText, filtered, trimmed)
        : app.addLocalChatProposal(prompt, replyText, filtered, runtime.activeProjectTarget(), trimmed);
      return;
    }
    reply(matches.length > 0
      ? `I only found that same folder for "${trimmed}". Try a more specific name or browse Projects.`
      : `I couldn't find another folder matching "${trimmed}". Try a different name or open Projects to browse.`);
  }, [app, runtime, s.selectedChatId]);

  const dismissFolderProposal = useCallback((proposalId: string) => {
    if (!s.selectedChatId) {
      s.setNewChatMessages((current) => current.map((message) => (
        message.folderProposal?.id === proposalId ? { ...message, folderProposal: { ...message.folderProposal, status: "dismissed" } } : message
      )));
      return;
    }
    if (isDetachedChatId(s.selectedChatId)) {
      const chatId = s.selectedChatId;
      app.setDetachedChatThreads((current) => ({
        ...current,
        [chatId]: (current[chatId] ?? []).map((message) => (
          message.folderProposal?.id === proposalId ? { ...message, folderProposal: { ...message.folderProposal, status: "dismissed" } } : message
        ))
      }));
      app.setDetachedChatUpdatedAt((current) => ({ ...current, [chatId]: Date.now() }));
      return;
    }
    app.resolveFolderProposal(proposalId, "dismissed", sourceProjectId(s));
  }, [app, s]);

  const skipFolderConfirm = useCallback(async () => { s.setFolderConfirm(null); await app.startAgent(runtime.activeProjectTarget()); }, [app, runtime, s]);
  const cancelFolderConfirm = useCallback(() => s.setFolderConfirm(null), [s]);

  return { acceptFolderConfirm, acceptFolderProposal, cancelFolderConfirm, dismissFolderProposal, searchFolderProposal, skipFolderConfirm, wrongFolderProposal };
}

function sourceProjectId(s: WorkspaceState) {
  return s.selectedChatId?.startsWith("project-") ? s.selectedChatId.replace("project-", "") : s.app.selectedProject.id;
}
