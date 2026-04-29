import * as Haptics from "expo-haptics";
import { Agent, BuildState, CodeChange, FileEntry, LogEvent, PreviewState } from "../types/domain";
import { dedupeFiles, formatAssistantReply } from "../utils/files";
import { impact } from "../utils/haptics";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";

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

  async function startAgent() {
    const trimmed = state.taskText.trim();
    if (!trimmed || state.agentRequesting) return;

    setters.setAgentRequesting(true);
    const assistantMessageId = appendPendingChat(trimmed);
    const optimisticAgent = makeOptimisticAgent(trimmed);
    const prompt = derived.selectedFile.id !== "empty"
      ? `In ${derived.selectedFile.path}: ${trimmed}`
      : trimmed;

    impact(Haptics.ImpactFeedbackStyle.Medium);
    setters.setAgents((current) => [optimisticAgent, ...current]);
    setters.setBuildState("building");
    setters.setPreviewState("refreshing");
    setters.setLastPrompt(trimmed);

    if (!state.connection) {
      finishDemoAgent(optimisticAgent, trimmed);
      setters.setAgentRequesting(false);
      return;
    }

    try {
      const result = await requests.agentRequest<AgentStartResult>("/agents/start", {
        method: "POST",
        body: JSON.stringify({
          projectId: derived.selectedProject.id,
          prompt,
          model: state.selectedModel,
          reasoningEffort: state.reasoningEffort
        })
      });
      finishRealAgent(result, optimisticAgent.id, assistantMessageId);
    } catch (error) {
      failAgent(optimisticAgent.id, assistantMessageId, error);
    } finally {
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

  function finishDemoAgent(agent: Agent, prompt: string) {
    setters.setAgents((current) => current.map((item) => (
      item.id === agent.id
        ? { ...item, state: "complete", progress: 100, file: "app/(dashboard)/project-switcher.tsx" }
        : item
    )));
    setters.setBuildState("passed");
    setters.setPreviewState("delivered");
    setters.setChanges([{
      id: makeId("diff"),
      file: "app/(dashboard)/project-switcher.tsx",
      summary: "Adds the requested Vibyra-driven project switcher",
      additions: 96,
      deletions: 18,
      status: "applied"
    }]);
    logs.appendLogs([
      { source: "Preview", message: "Updated preview delivered to iPhone", tone: "success" },
      { source: "Agent", message: `Demo agent completed: ${prompt}`, tone: "success" }
    ]);
    logs.advanceWorkflow(12);
  }

  function failAgent(agentId: string, assistantMessageId: string, error: unknown) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === agentId ? { ...agent, state: "failed", progress: 100 } : agent
    )));
    setters.setBuildState("failed");
    setters.setPreviewState("live");
    const message = error instanceof Error ? error.message : "Agent task failed";
    logs.appendLog(message, "Desktop Agent", "error");
    updateAssistantMessage(assistantMessageId, message);
  }

  function updateAssistantMessage(messageId: string, text: string) {
    setters.setChatMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, text } : message
    )));
  }

  return { startAgent };
}

type AgentStartResult = {
  agent: Agent;
  changes: CodeChange[];
  files: FileEntry[];
  reply: string;
  events: LogEvent[];
  preview: { state: PreviewState };
  buildState: BuildState;
};
