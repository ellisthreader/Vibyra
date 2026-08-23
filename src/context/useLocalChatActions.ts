import type { GeneratedApp } from "../types/domain";
import type { ChatResponse } from "../utils/appApi";
import { streamChatText, TYPING_CURSOR } from "../utils/chatStream";
import { isRunArtifact } from "../utils/files";
import { makeId } from "../utils/ids";
import type { AgentStartTarget } from "./appContextTypes";
import { createLocalChatDesktopActions } from "./localChatDesktopActions";
import { createLocalChatImageActions } from "./localChatImageActions";
import { createLocalChatProposalActions } from "./localChatProposalActions";
import type { useAppState } from "./useAppState";

type Store = ReturnType<typeof useAppState>;

export function useLocalChatActions(store: Store) {
  const { state, derived, setters } = store;
  function resolveChatTarget(target?: AgentStartTarget) {
    const projectId = target?.chatProjectId ?? target?.projectId ?? target?.project?.id ?? state.selectedProjectId;
    const targetFile = target?.file === null ? null : target?.file
      ?? (projectId === state.selectedProjectId && derived.selectedFile.id !== "empty" && !isRunArtifact(derived.selectedFile)
        ? derived.selectedFile : null);
    return { projectId, file: targetFile?.path };
  }

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
    setters.setChatThreads((current) => ({ ...current, [projectId]: [
      ...(current[projectId] ?? []), { id: makeId("chat-user"), role: "user", text: trimmed, file }
    ] }));
    setters.setTaskText("");
  }

  function addLocalChatReply(
    prompt: string, reply: string, target?: AgentStartTarget, app?: ChatResponse["app"] | GeneratedApp
  ) {
    const { projectId, file } = resolveChatTarget(target);
    const assistantId = makeId("chat-assistant");
    setters.setChatThreads((current) => ({ ...current, [projectId]: [
      ...(current[projectId] ?? []),
      { id: makeId("chat-user"), role: "user", text: prompt, file },
      { id: assistantId, role: "assistant", text: TYPING_CURSOR, file }
    ] }));
    setters.setTaskText("");
    streamChatText(reply, (text) => setters.setChatThreads((current) => {
      const thread = current[projectId];
      return thread ? { ...current, [projectId]: thread.map((message) =>
        message.id === assistantId ? { ...message, text, ...(app ? { app } : {}) } : message) } : current;
    }));
  }

  function addLocalChatNotice(
    _prompt: string, reply: string, target?: AgentStartTarget, app?: ChatResponse["app"] | GeneratedApp
  ) {
    const { projectId, file } = resolveChatTarget(target);
    setters.setChatThreads((current) => ({ ...current, [projectId]: [
      ...(current[projectId] ?? []),
      { id: makeId("chat-assistant"), role: "assistant", text: reply, file, ...(app ? { app } : {}) }
    ] }));
    setters.setTaskText("");
  }

  const desktop = createLocalChatDesktopActions({
    chatProjects: state.chatProjects, projects: state.projects, resolveChatTarget,
    selectedProjectId: state.selectedProjectId, setChatThreads: setters.setChatThreads, setTaskText: setters.setTaskText
  });
  const images = createLocalChatImageActions(store, resolveChatTarget);
  const proposals = createLocalChatProposalActions(store, resolveChatTarget);
  return {
    clearCurrentChat, addLocalUserMessage, addLocalChatNotice, addLocalChatReply, ...images,
    addLocalPreviewServerPrompt: desktop.addLocalPreviewServerPrompt,
    updatePreviewServerMessage: desktop.updatePreviewServerMessage,
    ...proposals,
    addLocalDesktopConnectionPrompt: desktop.addLocalDesktopConnectionPrompt,
    replaceDesktopConnectionWithProposal: desktop.replaceDesktopConnectionWithProposal,
    updateDesktopConnectionPrompt: desktop.updateDesktopConnectionPrompt
  };
}
