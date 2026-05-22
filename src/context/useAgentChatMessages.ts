import { MutableRefObject } from "react";
import type { Agent, ChatMessage, ChatRunStatus, LogEvent } from "../types/domain";
import { streamChatText } from "../utils/chatStream";
import { makeId } from "../utils/ids";
import { ChatResponse } from "../utils/appApi";
import { chatToolRunKey, isSameRunningChatToolRun, remainingChatToolProgressMs, type ChatToolRunKey } from "../utils/chatToolProgress";
import { userFacingAgentError } from "./agentErrors";
import { ResolvedAgentTarget } from "./agentActionHelpers";
import { useAppState } from "./useAppState";
import { isStaleBusyAssistantText } from "../utils/chatThreads";

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
    runStatus?: Pick<ChatRunStatus, "route" | "mode" | "activeFile" | "tool">,
    attachments?: ChatMessage["attachments"]
  ) {
    const userMessageId = makeId("chat-user");
    const assistantMessageId = makeId("chat-assistant");
    const file = target.file?.path;
    const startedAt = Date.now();
    const status = runStatus ? { ...runStatus, startedAt, status: "running" as const } : undefined;
    updateChatMessages(target.chatProjectId, (current) => [
      ...withoutTrailingBusyRetry(current, prompt, file),
      { id: userMessageId, role: "user", text: prompt, file, ...(hasAttachments(attachments) ? { attachments } : {}) },
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
    logs.appendLog(rawMessage, "AI Chat", "error");
    updateAssistantMessage(target, assistantMessageId, userFacingAgentError(error), undefined, "failed");
  }

  function updateAssistantMessage(
    target: ResolvedAgentTarget,
    messageId: string,
    text: string,
    app?: ChatResponse["app"],
    runStatus?: ChatRunStatus["status"]
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
      return next;
    }));
  }

  function streamAssistantMessage(
    target: ResolvedAgentTarget,
    messageId: string,
    fullText: string,
    app?: ChatResponse["app"],
    metadata?: Pick<ChatMessage, "codeChanges" | "codeFiles" | "codeProjectId" | "editApproval" | "pendingApplyId" | "creditCost">
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
          if (metadata.creditCost !== undefined) next.creditCost = metadata.creditCost;
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

  function appendStreamingDelta(target: ResolvedAgentTarget, messageId: string, delta: string) {
    if (!delta) return;
    updateChatMessages(target.chatProjectId, (current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const previous = message.text === "Working on it..." ? "" : message.text;
      return { ...message, text: previous + delta };
    }));
  }

  function finalizeStreamedAssistantMessage(
    target: ResolvedAgentTarget,
    messageId: string,
    finalText: string,
    app?: ChatResponse["app"],
    metadata?: Pick<ChatMessage, "codeChanges" | "codeFiles" | "codeProjectId" | "editApproval" | "pendingApplyId" | "creditCost">,
    expectedRun?: ChatToolRunKey | null
  ) {
    updateChatMessages(target.chatProjectId, (current) => current.map((message) => {
      if (message.id !== messageId) return message;
      if (!isSameRunningChatToolRun(message.runStatus, expectedRun ?? null)) return message;
      const delay = remainingChatToolProgressMs(message.runStatus);
      if (delay > 0) {
        const runKey = expectedRun ?? chatToolRunKey(message.runStatus);
        setTimeout(() => finalizeStreamedAssistantMessage(target, messageId, finalText, app, metadata, runKey), delay);
        return message;
      }
      const next: ChatMessage = { ...message, text: finalText };
      if (app !== undefined) {
        if (app) next.app = app;
        else delete next.app;
      }
      if (metadata) {
        next.codeChanges = metadata.codeChanges;
        next.codeFiles = metadata.codeFiles;
        next.codeProjectId = metadata.codeProjectId;
        if (metadata.creditCost !== undefined) next.creditCost = metadata.creditCost;
        if (metadata.editApproval !== undefined) next.editApproval = metadata.editApproval;
        if (metadata.pendingApplyId !== undefined) next.pendingApplyId = metadata.pendingApplyId;
      }
      if (next.runStatus) {
        next.runStatus = { ...next.runStatus, status: "complete", completedAt: Date.now() };
      }
      return next;
    }));
  }

  return { appendPendingChat, failAgent, streamAssistantMessage, appendStreamingDelta, finalizeStreamedAssistantMessage };
}

function hasAttachments(attachments?: ChatMessage["attachments"]) {
  return Boolean(attachments?.imageAttachments?.length || attachments?.fileAttachments?.length);
}

function withoutTrailingBusyRetry(messages: ChatMessage[], _prompt: string, _file?: string) {
  if (messages.length < 2) return messages;
  const user = messages[messages.length - 2];
  const assistant = messages[messages.length - 1];
  if (user.role !== "user" || assistant.role !== "assistant") return messages;
  return isRetryableBusyAssistant(assistant) ? messages.slice(0, -2) : messages;
}

function isRetryableBusyAssistant(message: ChatMessage) {
  return Boolean(message.agentBusy) || isStaleBusyAssistantText(message.text);
}
