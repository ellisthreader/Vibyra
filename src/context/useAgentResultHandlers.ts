import { ChatMessage, LogEvent } from "../types/domain";
import { appApiRequest, ChatResponse, LevelActivityResponse } from "../utils/appApi";
import { dedupeFiles, formatAssistantReply } from "../utils/files";
import { AgentStartResult } from "./agentTypes";
import { ResolvedAgentTarget } from "./agentActionHelpers";
import { previewAppForAgentResult } from "./agentPreviewHelpers";
import { useAppState } from "./useAppState";

type Store = ReturnType<typeof useAppState>;
type Logs = {
  appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void;
  advanceWorkflow: (index: number) => void;
};
type Messages = {
  streamAssistantMessage: (
    target: ResolvedAgentTarget,
    messageId: string,
    fullText: string,
    app?: ChatResponse["app"],
    metadata?: Pick<ChatMessage, "codeChanges" | "codeFiles" | "codeProjectId" | "editApproval" | "pendingApplyId">
  ) => void;
  finalizeStreamedAssistantMessage: (
    target: ResolvedAgentTarget,
    messageId: string,
    finalText: string,
    app?: ChatResponse["app"],
    metadata?: Pick<ChatMessage, "codeChanges" | "codeFiles" | "codeProjectId" | "editApproval" | "pendingApplyId">
  ) => void;
};

export function useAgentResultHandlers(store: Store, logs: Logs, messages: Messages) {
  const { state, setters } = store;

  function finishRealAgent(
    target: ResolvedAgentTarget,
    result: AgentStartResult,
    optimisticAgentId: string,
    assistantMessageId: string
  ) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === optimisticAgentId ? result.agent : agent
    )));
    setters.setBuildState(result.buildState);
    setters.setPreviewState(result.preview.state);
    if (!result.pendingApplyId) {
      setters.setChanges(result.changes);
      setters.setFiles((current) => dedupeFiles([...result.files, ...current]));
    }
    logs.advanceWorkflow(12);
    logs.appendLogs(result.events);
    const editApproval: ChatMessage["editApproval"] = result.changes.length === 0
      ? undefined
      : (result.pendingApplyId ? "pending" : "allowed");
    messages.streamAssistantMessage(
      target,
      assistantMessageId,
      formatAssistantReply(result.reply, result.changes),
      previewAppForAgentResult(state.connection, target.projectId, target.project.name, result),
      {
        codeChanges: result.changes,
        codeFiles: result.files,
        codeProjectId: target.projectId,
        editApproval,
        pendingApplyId: result.pendingApplyId
      }
    );
    if (state.authToken) {
      appApiRequest<LevelActivityResponse>("/api/level/activity", {
        method: "POST",
        body: JSON.stringify({
          action: "coding_agent_completed",
          contextId: `desktop-agent:${result.agent.id}`,
          meta: {
            projectId: target.projectId,
            model: result.agent.model,
            pendingApply: Boolean(result.pendingApplyId)
          }
        })
      }, state.authToken)
        .then((levelResult) => {
          if (levelResult.user) {
            setters.setCreditsBalance(levelResult.user.creditsBalance);
            setters.setCreditsUsed(levelResult.user.creditsUsed);
            setters.setLevelProgress(levelResult.user.level);
          } else if (levelResult.level) {
            setters.setLevelProgress(levelResult.level);
          }
        })
        .catch(() => {
          /* Desktop coding still completes if level sync is temporarily unavailable. */
        });
    }
  }

  function finishOpenRouterAgent(
    target: ResolvedAgentTarget,
    result: ChatResponse,
    optimisticAgentId: string,
    assistantMessageId: string
  ) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === optimisticAgentId
        ? { ...agent, state: "complete", progress: 100, file: `OpenRouter - ${result.model}` }
        : agent
    )));
    setters.setBuildState(result.app ? "passed" : "idle");
    setters.setPreviewState(result.app ? "delivered" : "live");
    setters.setCreditsBalance(result.user?.creditsBalance ?? result.creditsBalance);
    setters.setCreditsUsed(result.user?.creditsUsed ?? result.creditsUsed);
    if (result.user?.level) setters.setLevelProgress(result.user.level);
    if (result.title) {
      setters.setChatTitles((current) => ({
        ...current,
        [target.chatProjectId]: result.title ?? current[target.chatProjectId] ?? target.project.name
      }));
    }
    logs.appendLogs([
      { source: "OpenRouter", message: `Model replied with ${result.model}`, tone: "success" },
      { source: "Credits", message: `${result.creditCost} credit${result.creditCost === 1 ? "" : "s"} used`, tone: "info" }
    ]);
    logs.advanceWorkflow(12);
    const app = generatedPreviewApp(result.app ?? null);
    messages.streamAssistantMessage(target, assistantMessageId, result.reply, app, previewCodeMetadata(app));
  }

  function finishStreamedOpenRouterAgent(
    target: ResolvedAgentTarget,
    result: ChatResponse,
    optimisticAgentId: string,
    assistantMessageId: string
  ) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === optimisticAgentId
        ? { ...agent, state: "complete", progress: 100, file: `OpenRouter - ${result.model}` }
        : agent
    )));
    setters.setBuildState(result.app ? "passed" : "idle");
    setters.setPreviewState(result.app ? "delivered" : "live");
    setters.setCreditsBalance(result.user?.creditsBalance ?? result.creditsBalance);
    setters.setCreditsUsed(result.user?.creditsUsed ?? result.creditsUsed);
    if (result.user?.level) setters.setLevelProgress(result.user.level);
    if (result.title) {
      setters.setChatTitles((current) => ({
        ...current,
        [target.chatProjectId]: result.title ?? current[target.chatProjectId] ?? target.project.name
      }));
    }
    logs.appendLogs([
      { source: "OpenRouter", message: `Model replied with ${result.model}`, tone: "success" },
      { source: "Credits", message: `${result.creditCost} credit${result.creditCost === 1 ? "" : "s"} used`, tone: "info" }
    ]);
    logs.advanceWorkflow(12);
    const app = generatedPreviewApp(result.app ?? null);
    messages.finalizeStreamedAssistantMessage(target, assistantMessageId, result.reply, app, previewCodeMetadata(app));
  }

  return { finishRealAgent, finishOpenRouterAgent, finishStreamedOpenRouterAgent };
}

function previewCodeMetadata(app: ChatResponse["app"]): Pick<ChatMessage, "codeChanges" | "codeFiles" | "codeProjectId" | "editApproval"> | undefined {
  const html = app?.html?.trim();
  if (!app || !html) return undefined;
  const appId = app.id;
  const path = "index.html";
  const lines = countLines(html);
  return {
    codeChanges: [{ id: `${appId}-preview-html`, file: path, summary: "Generated runnable preview", additions: lines, deletions: 0, status: "applied" }],
    codeFiles: [{ id: `${appId}-preview-file`, name: path, path, language: "html", changed: "added", body: html, previousBody: null }],
    codeProjectId: undefined,
    editApproval: "allowed"
  };
}

function generatedPreviewApp(app: ChatResponse["app"]): ChatResponse["app"] {
  if (!app) return app;
  return { source: "generated", ...app };
}

function countLines(value: string) {
  return value ? value.split(/\r\n|\r|\n/).length : 0;
}
