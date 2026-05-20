import { GeneratedApp, Project } from "../types/domain";
import type { GeneratedImage } from "../types/chatTools";
import { ChatResponse } from "../utils/appApi";
import { streamChatText, TYPING_CURSOR } from "../utils/chatStream";
import { isRunArtifact } from "../utils/files";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";
import type { AgentStartTarget, AppContextValue } from "./appContextTypes";
import { createLocalChatDesktopActions } from "./localChatDesktopActions";
import { updateThreadMessage } from "./localChatMessageHelpers";

type Store = ReturnType<typeof useAppState>;

export function useLocalChatActions(store: Store) {
  const { state, derived, setters } = store;

  function clearCurrentChat(projectId = state.selectedProjectId) {
    setters.setChatThreads((current) => ({ ...current, [projectId]: [] }));
    setters.setChatTitles((current) => {
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    setters.setTaskText("");
  }

  function addLocalUserMessage(prompt: string, target?: AgentStartTarget) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const { projectId, file } = resolveChatTarget(target);
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-user"), role: "user", text: trimmed, file }
      ]
    }));
    setters.setTaskText("");
  }

  function addLocalChatReply(prompt: string, reply: string, target?: AgentStartTarget, app?: ChatResponse["app"] | GeneratedApp) {
    const { projectId, file } = resolveChatTarget(target);
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
          [projectId]: thread.map((m) => (m.id === assistantId ? { ...m, text, ...(app ? { app } : {}) } : m))
        };
      });
    });
  }

  function addLocalChatNotice(_prompt: string, reply: string, target?: AgentStartTarget, app?: ChatResponse["app"] | GeneratedApp) {
    const { projectId, file } = resolveChatTarget(target);
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-assistant"), role: "assistant", text: reply, file, ...(app ? { app } : {}) }
      ]
    }));
    setters.setTaskText("");
  }

  function addLocalGeneratedImage(prompt: string, image: GeneratedImage, target?: AgentStartTarget) {
    const { projectId, file } = resolveChatTarget(target);
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-user"), role: "user", text: prompt, file },
        { id: makeId("chat-assistant"), role: "assistant", text: `Created **${image.title}**.`, file, generatedImage: image }
      ]
    }));
    setters.setTaskText("");
  }

  function addLocalImageGenerationPending(prompt: string, target?: AgentStartTarget) {
    const { projectId, file } = resolveChatTarget(target);
    const assistantId = makeId("chat-assistant");
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-user"), role: "user", text: prompt, file },
        {
          id: assistantId,
          role: "assistant",
          text: "Working on it...",
          file,
          runStatus: { route: "cloud", mode: "chat", status: "running", tool: "image", startedAt: Date.now() }
        }
      ]
    }));
    setters.setTaskText("");
    return assistantId;
  }

  function finishLocalGeneratedImage(messageId: string, image: GeneratedImage, target?: AgentStartTarget) {
    const { projectId } = resolveChatTarget(target);
    setters.setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => ({
      ...message,
      text: `Created **${image.title}**.`,
      generatedImage: image,
      runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus
    })));
  }

  function failLocalImageGeneration(messageId: string, error: string, target?: AgentStartTarget) {
    const { projectId } = resolveChatTarget(target);
    setters.setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => ({
      ...message,
      text: error,
      runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
    })));
  }

  function addLocalChatProposal(
    prompt: string,
    reply: string,
    matches: Project[],
    target?: AgentStartTarget,
    query?: string
  ) {
    const { projectId, file } = resolveChatTarget(target);
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
        return { ...current, [projectId]: thread.map((m) => (m.id === assistantId ? { ...m, text } : m)) };
      });
    });
    return { proposalProjectId: projectId };
  }

  function addLocalFolderRecovery(
    prompt: string,
    reply: string,
    recovery: NonNullable<AppContextValue["chatMessages"][number]["folderRecovery"]>,
    target?: AgentStartTarget
  ) {
    const { projectId, file } = resolveChatTarget(target);
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-user"), role: "user", text: prompt, file },
        { id: makeId("chat-assistant"), role: "assistant", text: reply, file, folderRecovery: recovery }
      ]
    }));
    setters.setTaskText("");
  }

  function resolveFolderProposal(proposalId: string, status: "accepted" | "dismissed", projectId?: string) {
    updateFolderProposal(proposalId, { status }, projectId);
  }

  function updateFolderProposal(
    proposalId: string,
    update: Partial<NonNullable<AppContextValue["chatMessages"][number]["folderProposal"]>>,
    projectId = state.selectedProjectId
  ) {
    setters.setChatThreads((current) => {
      const thread = current[projectId];
      if (!thread) return current;
      return {
        ...current,
        [projectId]: thread.map((message) => (
          message.folderProposal?.id === proposalId
            ? { ...message, folderProposal: { ...message.folderProposal, ...update } }
            : message
        ))
      };
    });
  }

  function resolveChatTarget(target?: AgentStartTarget) {
    const projectId = target?.chatProjectId ?? target?.projectId ?? target?.project?.id ?? state.selectedProjectId;
    const targetFile = target?.file === null
      ? null
      : target?.file ?? (projectId === state.selectedProjectId && derived.selectedFile.id !== "empty" && !isRunArtifact(derived.selectedFile)
        ? derived.selectedFile
        : null);
    return { projectId, file: targetFile?.path };
  }

  const desktopActions = createLocalChatDesktopActions({
    chatProjects: state.chatProjects,
    projects: state.projects,
    resolveChatTarget,
    selectedProjectId: state.selectedProjectId,
    setChatThreads: setters.setChatThreads,
    setTaskText: setters.setTaskText
  });

  return {
    clearCurrentChat,
    addLocalUserMessage,
    addLocalChatNotice,
    addLocalChatReply,
    addLocalGeneratedImage,
    addLocalImageGenerationPending,
    finishLocalGeneratedImage,
    failLocalImageGeneration,
    addLocalPreviewServerPrompt: desktopActions.addLocalPreviewServerPrompt,
    updatePreviewServerMessage: desktopActions.updatePreviewServerMessage,
    addLocalChatProposal,
    addLocalDesktopConnectionPrompt: desktopActions.addLocalDesktopConnectionPrompt,
    addLocalFolderRecovery,
    replaceDesktopConnectionWithProposal: desktopActions.replaceDesktopConnectionWithProposal,
    resolveFolderProposal,
    updateDesktopConnectionPrompt: desktopActions.updateDesktopConnectionPrompt,
    updateFolderProposal
  };
}
