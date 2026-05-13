import { MutableRefObject } from "react";
import type { Agent, AgentBusyInfo, ChatMessage, ChatRunStatus, LogEvent } from "../types/domain";
import { streamChatText } from "../utils/chatStream";
import { makeId } from "../utils/ids";
import { ChatResponse } from "../utils/appApi";
import { agentBusyInfoFromError, userFacingAgentError } from "./agentErrors";
import { ResolvedAgentTarget } from "./agentActionHelpers";
import { useAppState } from "./useAppState";

type Store = ReturnType<typeof useAppState>;
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
};

export function useAgentChatMessages(
  store: Store,
  logs: Logs,
  streamingRef: MutableRefObject<(() => void) | null>
) {
  const { setters } = store;

  function updateChatMessages(projectId: string, update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) {
    setters.setChatThreads((current) => {
      const previous = current[projectId] ?? [];
      const nextMessages = typeof update === "function" ? update(previous) : update;
      return { ...current, [projectId]: nextMessages };
    });
  }

  function appendPendingChat(
    target: ResolvedAgentTarget,
    prompt: string,
    assistantModel?: string,
    runStatus?: Pick<ChatRunStatus, "route" | "mode" | "activeFile">
  ) {
    const userMessageId = makeId("chat-user");
    const assistantMessageId = makeId("chat-assistant");
    const file = target.file?.path;
    const startedAt = Date.now();
    const status = runStatus ? { ...runStatus, startedAt, status: "running" as const } : undefined;
    updateChatMessages(target.chatProjectId, (current) => [
      ...current,
      { id: userMessageId, role: "user", text: prompt, file },
      {
        id: assistantMessageId,
        role: "assistant",
        text: "Working on it...",
        file,
        assistantModel,
        runStatus: status
      }
    ]);
    setters.setTaskText("");
    return assistantMessageId;
  }

  function failAgent(target: ResolvedAgentTarget, agent: Agent, assistantMessageId: string, error: unknown) {
    setters.setAgents((current) => current.map((item) => (
      item.id === agent.id ? { ...item, state: "failed", progress: 100 } : item
    )));
    setters.setBuildState("failed");
    setters.setPreviewState("live");
    const rawMessage = error instanceof Error ? error.message : "Agent task failed";
    const busyInfo = agentBusyInfoFromError(error) ?? fallbackBusyInfo(rawMessage, target, agent);
    logs.appendLog(rawMessage, "AI Chat", "error");
    updateAssistantMessage(target, assistantMessageId, userFacingAgentError(rawMessage), undefined, "failed", busyInfo);
  }

  function fallbackBusyInfo(message: string, target: ResolvedAgentTarget, agent: Agent): AgentBusyInfo | undefined {
    if (!message.toLowerCase().includes("already running")) return undefined;
    return {
      reason: "unreported",
      runId: null,
      title: agent.title,
      model: agent.model,
      projectId: target.projectId,
      projectName: target.project.name,
      projectPath: target.project.path,
      state: "running",
      progress: null,
      file: target.file?.path ?? null,
      startedAt: null,
      updatedAt: null,
      elapsedSeconds: null
    };
  }

  function updateAssistantMessage(
    target: ResolvedAgentTarget,
    messageId: string,
    text: string,
    app?: ChatResponse["app"],
    runStatus?: ChatRunStatus["status"],
    agentBusy?: ChatMessage["agentBusy"]
  ) {
    updateChatMessages(target.chatProjectId, (current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const next = { ...message, text };
      if (app !== undefined) {
        if (app) next.app = app;
        else delete next.app;
      }
      if (runStatus && next.runStatus) {
        next.runStatus = { ...next.runStatus, status: runStatus, completedAt: Date.now() };
      }
      if (agentBusy) {
        next.agentBusy = agentBusy;
      }
      return next;
    }));
  }

  function streamAssistantMessage(
    target: ResolvedAgentTarget,
    messageId: string,
    fullText: string,
    app?: ChatResponse["app"],
    metadata?: Pick<ChatMessage, "codeChanges" | "codeFiles" | "codeProjectId" | "editApproval" | "pendingApplyId">
  ) {
    if (streamingRef.current) {
      streamingRef.current();
      streamingRef.current = null;
    }
    streamingRef.current = streamChatText(fullText, (text, done) => {
      updateChatMessages(target.chatProjectId, (current) => current.map((message) => {
        if (message.id !== messageId) return message;
        const next = { ...message, text };
        if (done && app !== undefined) {
          if (app) next.app = app;
          else delete next.app;
        }
        if (done && metadata) {
          next.codeChanges = metadata.codeChanges;
          next.codeFiles = metadata.codeFiles;
          next.codeProjectId = metadata.codeProjectId;
          if (metadata.editApproval !== undefined) next.editApproval = metadata.editApproval;
          if (metadata.pendingApplyId !== undefined) next.pendingApplyId = metadata.pendingApplyId;
        }
        if (done && next.runStatus) {
          next.runStatus = { ...next.runStatus, status: "complete", completedAt: Date.now() };
        }
        return next;
      }));
      if (done) streamingRef.current = null;
    });
  }

  return { appendPendingChat, failAgent, streamAssistantMessage };
}
