import { DesktopConnectionPrompt, GeneratedApp, Project } from "../types/domain";
import { ChatResponse } from "../utils/appApi";
import { streamChatText, TYPING_CURSOR } from "../utils/chatStream";
import { isRunArtifact } from "../utils/files";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";
import type { AgentStartTarget, AppContextValue } from "./appContextTypes";

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

  function addLocalChatNotice(_prompt: string, reply: string, target?: AgentStartTarget) {
    const { projectId, file } = resolveChatTarget(target);
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-assistant"), role: "assistant", text: reply, file }
      ]
    }));
    setters.setTaskText("");
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

  function addLocalDesktopConnectionPrompt(
    prompt: string,
    connectionPrompt: DesktopConnectionPrompt,
    target?: AgentStartTarget
  ) {
    const { projectId, file } = resolveChatTarget(target);
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-user"), role: "user", text: prompt, file },
        {
          id: makeId("chat-assistant"),
          role: "assistant",
          text: desktopConnectionReply(connectionPrompt),
          file,
          desktopConnection: connectionPrompt
        }
      ]
    }));
    setters.setTaskText("");
  }

  function resolveFolderProposal(proposalId: string, status: "accepted" | "dismissed", projectId?: string) {
    updateFolderProposal(proposalId, { status }, projectId);
  }

  function updateDesktopConnectionPrompt(messageId: string, update: Partial<DesktopConnectionPrompt>, projectId = state.selectedProjectId) {
    setters.setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => ({ ...message, desktopConnection: message.desktopConnection ? { ...message.desktopConnection, ...update } : message.desktopConnection })));
  }

  function replaceDesktopConnectionWithProposal(messageId: string, reply: string, matches: Project[], query: string, projectId = state.selectedProjectId) {
    setters.setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => {
      const { desktopConnection: _desktopConnection, ...rest } = message;
      if (matches.length === 0) return { ...rest, text: reply };
      return {
        ...rest,
        text: reply,
        folderProposal: { id: makeId("proposal"), status: "pending", matches, selectedIndex: 0, query }
      };
    }));
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

  return {
    clearCurrentChat,
    addLocalUserMessage,
    addLocalChatNotice,
    addLocalChatReply,
    addLocalChatProposal,
    addLocalDesktopConnectionPrompt,
    addLocalFolderRecovery,
    replaceDesktopConnectionWithProposal,
    resolveFolderProposal,
    updateDesktopConnectionPrompt,
    updateFolderProposal
  };
}

function updateThreadMessage(current: Record<string, AppContextValue["chatMessages"]>, projectId: string, messageId: string, update: (message: AppContextValue["chatMessages"][number]) => AppContextValue["chatMessages"][number]) {
  const thread = current[projectId];
  if (!thread) return current;
  return { ...current, [projectId]: thread.map((message) => (message.id === messageId ? update(message) : message)) };
}

function desktopConnectionReply(connectionPrompt: DesktopConnectionPrompt) {
  if (connectionPrompt.reason === "desktop-agent") {
    return "Connect Vibyra Desktop so I can create a project folder on your PC.";
  }
  if (connectionPrompt.reason === "desktop-browse") {
    return connectionPrompt.query
      ? `Connect Vibyra Desktop so I can open "${connectionPrompt.query}" from your PC.`
      : "Connect Vibyra Desktop so I can open this PC project.";
  }
  return connectionPrompt.query
    ? `Connect Vibyra Desktop so I can search your PC for "${connectionPrompt.query}".`
    : "Connect Vibyra Desktop so I can search and open folders on your PC.";
}
