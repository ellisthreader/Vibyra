import { useRef } from "react";
import * as Haptics from "expo-haptics";
import { Agent, LogEvent } from "../types/domain";
import { appApiRequest, ChatResponse } from "../utils/appApi";
import { dedupeFiles, formatAssistantReply } from "../utils/files";
import { impact } from "../utils/haptics";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";
import { AgentStartResult, calculatePromptMoney, roundMoney } from "./agentTypes";

type Store = ReturnType<typeof useAppState>;
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
  appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void;
  advanceWorkflow: (index: number) => void;
};

export function useAgentActions(store: Store, requests: Requests, logs: Logs) {
  const { state, derived, setters } = store;
  const agentRequestingRef = useRef(false);

  async function startAgent() {
    const trimmed = state.taskText.trim();
    if (!trimmed || state.agentRequesting || agentRequestingRef.current) return;

    agentRequestingRef.current = true;
    setters.setAgentRequesting(true);
    const assistantMessageId = appendPendingChat(trimmed);
    const optimisticAgent = makeOptimisticAgent(trimmed);
    const prompt = derived.selectedFile.id !== "empty"
      ? `In ${derived.selectedFile.path}: ${trimmed}`
      : trimmed;
    const earned = calculatePromptMoney(trimmed);

    impact(Haptics.ImpactFeedbackStyle.Medium);
    setters.setPromptMoney((current) => ({
      total: roundMoney(current.total + earned),
      count: current.count + 1,
      lastEarned: earned,
      longestPromptLength: Math.max(current.longestPromptLength, trimmed.length)
    }));
    setters.setAgents((current) => [optimisticAgent, ...current]);
    setters.setBuildState("building");
    setters.setPreviewState("refreshing");
    setters.setLastPrompt(trimmed);

    try {
      if (state.connection) {
        const result = await requests.agentRequest<AgentStartResult>("/agents/start", {
          method: "POST",
          body: JSON.stringify({
            model: state.selectedModel,
            projectId: derived.selectedProject.id,
            prompt,
            reasoningEffort: state.reasoningEffort
          })
        });
        finishRealAgent(result, optimisticAgent.id, assistantMessageId);
        return;
      }

      if (!state.authToken) {
        throw new Error("Log in or create an account to use Vibyra AI chat.");
      }

      const result = await appApiRequest<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          fileBody: derived.selectedFile.id !== "empty" ? derived.selectedFile.body : "",
          filePath: derived.selectedFile.id !== "empty" ? derived.selectedFile.path : "",
          history: state.chatMessages
            .filter((message) => message.id !== "welcome" && message.text.trim() && message.text !== "Working on it...")
            .slice(-8)
            .map((message) => ({
              file: message.file,
              role: message.role,
              text: message.text
            })),
          model: state.selectedChatModel || state.selectedModel,
          project: derived.selectedProject.name,
          prompt
        })
      }, state.authToken);
      finishOpenRouterAgent(result, optimisticAgent.id, assistantMessageId);
    } catch (error) {
      failAgent(optimisticAgent.id, assistantMessageId, error);
    } finally {
      agentRequestingRef.current = false;
      setters.setAgentRequesting(false);
    }
  }

  function appendPendingChat(prompt: string) {
    const userMessageId = makeId("chat-user");
    const assistantMessageId = makeId("chat-assistant");
    const file = derived.selectedFile.id !== "empty" ? derived.selectedFile.path : undefined;
    setters.setChatMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: prompt, file },
      { id: assistantMessageId, role: "assistant", text: "Working on it...", file }
    ]);
    setters.setTaskText("");
    return assistantMessageId;
  }

  function makeOptimisticAgent(title: string): Agent {
    return {
      id: makeId("agent"),
      title,
      model: state.selectedModel,
      projectId: derived.selectedProject.id,
      state: "running",
      progress: 12,
      file: "backend/orchestration"
    };
  }

  function finishRealAgent(result: AgentStartResult, optimisticAgentId: string, assistantMessageId: string) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === optimisticAgentId ? result.agent : agent
    )));
    setters.setBuildState(result.buildState);
    setters.setPreviewState(result.preview.state);
    setters.setChanges(result.changes);
    setters.setFiles((current) => dedupeFiles([...result.files, ...current]));
    logs.advanceWorkflow(12);
    logs.appendLogs(result.events);
    updateAssistantMessage(assistantMessageId, formatAssistantReply(result.reply, result.changes));
  }

  function finishOpenRouterAgent(result: ChatResponse, optimisticAgentId: string, assistantMessageId: string) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === optimisticAgentId
        ? { ...agent, state: "complete", progress: 100, file: `OpenRouter - ${result.model}` }
        : agent
    )));
    setters.setBuildState("passed");
    setters.setPreviewState("delivered");
    setters.setCreditsBalance(result.creditsBalance);
    setters.setCreditsUsed(result.creditsUsed);
    if (result.title) {
      setters.setChatTitles((current) => ({
        ...current,
        [state.selectedProjectId]: result.title ?? current[state.selectedProjectId] ?? derived.selectedProject.name
      }));
    }
    logs.appendLogs([
      { source: "OpenRouter", message: `Model replied with ${result.model}`, tone: "success" },
      { source: "Credits", message: `${result.creditCost} credit${result.creditCost === 1 ? "" : "s"} used`, tone: "info" }
    ]);
    logs.advanceWorkflow(12);
    updateAssistantMessage(assistantMessageId, result.reply, result.app ?? null);
  }

  function failAgent(agentId: string, assistantMessageId: string, error: unknown) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === agentId ? { ...agent, state: "failed", progress: 100 } : agent
    )));
    setters.setBuildState("failed");
    setters.setPreviewState("live");
    const message = error instanceof Error ? error.message : "Agent task failed";
    logs.appendLog(message, "AI Chat", "error");
    updateAssistantMessage(assistantMessageId, message);
  }

  function updateAssistantMessage(messageId: string, text: string, app?: ChatResponse["app"]) {
    setters.setChatMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const next = { ...message, text };
      if (app !== undefined) {
        if (app) next.app = app;
        else delete next.app;
      }
      return next;
    }));
  }

  return { startAgent };
}

