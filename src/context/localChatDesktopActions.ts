import type { Dispatch, SetStateAction } from "react";
import type { DesktopConnectionPrompt, GeneratedApp, Project, ChatMessage } from "../types/domain";
import type { ChatResponse } from "../utils/appApi";
import { makeId } from "../utils/ids";
import type { AgentStartTarget, AppContextValue } from "./appContextTypes";
import { desktopConnectionReply, previewServerText, updateThreadMessage } from "./localChatMessageHelpers";

type ResolveChatTarget = (target?: AgentStartTarget) => { projectId: string; file?: string };

type LocalChatDesktopDeps = {
  chatProjects: Record<string, Project>;
  projects: Project[];
  resolveChatTarget: ResolveChatTarget;
  selectedProjectId: string;
  setChatThreads: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
  setTaskText: Dispatch<SetStateAction<string>>;
};

export function createLocalChatDesktopActions({
  chatProjects,
  projects,
  resolveChatTarget,
  selectedProjectId,
  setChatThreads,
  setTaskText
}: LocalChatDesktopDeps) {
  function addLocalPreviewServerPrompt(prompt: string, target?: AgentStartTarget) {
    const { projectId, file } = resolveChatTarget(target);
    const messageId = makeId("preview-server");
    const projectName = target?.project?.name
      ?? projects.find((project) => project.id === projectId)?.name
      ?? chatProjects[projectId]?.name
      ?? "this project";
    setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-user"), role: "user", text: prompt, file },
        {
          id: messageId,
          role: "assistant",
          text: `Start preview server for ${projectName}`,
          file,
          previewServer: { id: messageId, projectId, projectName, status: "approval", phase: "waiting-approval" }
        }
      ]
    }));
    setTaskText("");
    return messageId;
  }

  function updatePreviewServerMessage(messageId: string, projectId: string, update: Parameters<AppContextValue["updatePreviewServerMessage"]>[2], app?: ChatResponse["app"] | GeneratedApp) {
    setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => {
      if (!message.previewServer) return message;
      return {
        ...message,
        text: previewServerText(message.previewServer.projectName, update.status ?? message.previewServer.status),
        previewServer: { ...message.previewServer, ...update },
        ...(app ? { app } : {})
      };
    }));
  }

  function addLocalDesktopConnectionPrompt(prompt: string, connectionPrompt: DesktopConnectionPrompt, target?: AgentStartTarget) {
    const { projectId, file } = resolveChatTarget(target);
    setChatThreads((current) => ({
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
    setTaskText("");
  }

  function updateDesktopConnectionPrompt(messageId: string, update: Partial<DesktopConnectionPrompt>, projectId = selectedProjectId) {
    setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => ({ ...message, desktopConnection: message.desktopConnection ? { ...message.desktopConnection, ...update } : message.desktopConnection })));
  }

  function replaceDesktopConnectionWithProposal(messageId: string, reply: string, matches: Project[], query: string, projectId = selectedProjectId) {
    setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => {
      const { desktopConnection: _desktopConnection, ...rest } = message;
      if (matches.length === 0) return { ...rest, text: reply };
      return {
        ...rest,
        text: reply,
        folderProposal: { id: makeId("proposal"), status: "pending", matches, selectedIndex: 0, query }
      };
    }));
  }

  return {
    addLocalDesktopConnectionPrompt,
    addLocalPreviewServerPrompt,
    replaceDesktopConnectionWithProposal,
    updateDesktopConnectionPrompt,
    updatePreviewServerMessage
  };
}
