import { useRef } from "react";
import * as Haptics from "expo-haptics";
import { Agent, ChatMessage, FileEntry, LogEvent, Project } from "../types/domain";
import { appApiRequest, ChatResponse } from "../utils/appApi";
import { dedupeFiles, formatAssistantReply } from "../utils/files";
import { impact } from "../utils/haptics";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";
import { AgentStartResult, calculatePromptMoney, roundMoney } from "./agentTypes";
import { userFacingAgentError } from "./agentErrors";
import type { AgentStartTarget } from "./appContextTypes";

type Store = ReturnType<typeof useAppState>;
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
  appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void;
  advanceWorkflow: (index: number) => void;
};
type ResolvedAgentTarget = {
  project: Project;
  projectId: string;
  chatProjectId: string;
  file: FileEntry | null;
};

export function useAgentActions(store: Store, requests: Requests, logs: Logs) {
  const { state, derived, setters } = store;
  const agentRequestingRef = useRef(false);
  const streamingRef = useRef<{ cancel: () => void } | null>(null);

  async function startAgent(target?: AgentStartTarget) {
    const trimmed = state.taskText.trim();
    if (!trimmed || state.agentRequesting || agentRequestingRef.current) return;

    if (streamingRef.current) {
      streamingRef.current.cancel();
      streamingRef.current = null;
    }

    const skillMatch = trimmed.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
    const skill = skillMatch ? state.chatSkills.find((s) => s.id === skillMatch[1]) : undefined;
    const skillId = skill?.id;
    const userText = skill ? (skillMatch?.[2] ?? "").trim() : trimmed;
    const visibleText = skill
      ? (userText ? `${skill.slash} ${userText}` : skill.slash)
      : trimmed;

    const chatTarget = resolveTarget(target);
    agentRequestingRef.current = true;
    setters.setAgentRequesting(true);
    const assistantMessageId = appendPendingChat(chatTarget, visibleText);
    const optimisticAgent = makeOptimisticAgent(chatTarget, visibleText);
    const promptBody = userText || (skill ? skill.label : trimmed);
    const prompt = chatTarget.file
      ? `In ${chatTarget.file.path}: ${promptBody}`
      : promptBody;
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
            projectId: chatTarget.projectId,
            prompt,
            reasoningEffort: state.reasoningEffort
          })
        });
        finishRealAgent(chatTarget, result, optimisticAgent.id, assistantMessageId);
        return;
      }

      if (!state.authToken) {
        throw new Error("Log in or create an account to use Vibyra AI chat.");
      }

      const buildMode = skill?.mode === "build"
        || (!skill && /\b(build|create|make|generate|design|prototype)\b.*\b(app|tool|page|tracker|dashboard|calculator|game|ui|widget|landing|form|site|website|screen)\b/i.test(prompt));
      const fileBody = chatTarget.file && buildMode
        ? (chatTarget.file.body || "").slice(0, 1200)
        : "";
      const filePath = chatTarget.file ? chatTarget.file.path : "";
      const historyWindow = buildMode ? 4 : 3;
      const historyCharCap = buildMode ? 1200 : 600;
      const history = state.chatThreads[chatTarget.chatProjectId] ?? [];

      const result = await appApiRequest<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          fileBody,
          filePath,
          history: history
            .filter((message) => message.id !== "welcome" && message.text.trim() && message.text !== "Working on it...")
            .slice(-historyWindow)
            .map((message) => ({
              role: message.role,
              text: message.text.slice(0, historyCharCap)
            })),
          model: state.selectedChatModel || state.selectedModel,
          project: chatTarget.project.name,
          prompt,
          skill: skillId ?? ""
        })
      }, state.authToken);
      finishOpenRouterAgent(chatTarget, result, optimisticAgent.id, assistantMessageId);
    } catch (error) {
      failAgent(chatTarget, optimisticAgent.id, assistantMessageId, error);
    } finally {
      agentRequestingRef.current = false;
      setters.setAgentRequesting(false);
    }
  }

  function resolveTarget(target?: AgentStartTarget): ResolvedAgentTarget {
    const explicitProjectId = target?.projectId ?? target?.project?.id ?? target?.chatProjectId;
    const project = target?.project
      ?? state.projects.find((item) => item.id === explicitProjectId)
      ?? derived.selectedProject;
    const projectId = explicitProjectId ?? project.id;
    const chatProjectId = target?.chatProjectId ?? projectId;
    const selectedFile = projectId === state.selectedProjectId && derived.selectedFile.id !== "empty"
      ? derived.selectedFile
      : null;
    const file = target?.file === null ? null : target?.file ?? selectedFile;

    return {
      project,
      projectId,
      chatProjectId,
      file: file && file.id !== "empty" ? file : null
    };
  }

  function updateChatMessages(projectId: string, update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) {
    setters.setChatThreads((current) => {
      const previous = current[projectId] ?? [];
      const nextMessages = typeof update === "function" ? update(previous) : update;
      return { ...current, [projectId]: nextMessages };
    });
  }

  function appendPendingChat(target: ResolvedAgentTarget, prompt: string) {
    const userMessageId = makeId("chat-user");
    const assistantMessageId = makeId("chat-assistant");
    const file = target.file?.path;
    updateChatMessages(target.chatProjectId, (current) => [
      ...current,
      { id: userMessageId, role: "user", text: prompt, file },
      { id: assistantMessageId, role: "assistant", text: "Working on it...", file }
    ]);
    setters.setTaskText("");
    return assistantMessageId;
  }

  function makeOptimisticAgent(target: ResolvedAgentTarget, title: string): Agent {
    return {
      id: makeId("agent"),
      title,
      model: state.selectedModel,
      projectId: target.projectId,
      state: "running",
      progress: 12,
      file: "backend/orchestration"
    };
  }

  function finishRealAgent(target: ResolvedAgentTarget, result: AgentStartResult, optimisticAgentId: string, assistantMessageId: string) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === optimisticAgentId ? result.agent : agent
    )));
    setters.setBuildState(result.buildState);
    setters.setPreviewState(result.preview.state);
    setters.setChanges(result.changes);
    setters.setFiles((current) => dedupeFiles([...result.files, ...current]));
    logs.advanceWorkflow(12);
    logs.appendLogs(result.events);
    streamAssistantMessage(target, assistantMessageId, formatAssistantReply(result.reply, result.changes));
  }

  function finishOpenRouterAgent(target: ResolvedAgentTarget, result: ChatResponse, optimisticAgentId: string, assistantMessageId: string) {
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
        [target.chatProjectId]: result.title ?? current[target.chatProjectId] ?? target.project.name
      }));
    }
    logs.appendLogs([
      { source: "OpenRouter", message: `Model replied with ${result.model}`, tone: "success" },
      { source: "Credits", message: `${result.creditCost} credit${result.creditCost === 1 ? "" : "s"} used`, tone: "info" }
    ]);
    logs.advanceWorkflow(12);
    streamAssistantMessage(target, assistantMessageId, result.reply, result.app ?? null);
  }

  function failAgent(target: ResolvedAgentTarget, agentId: string, assistantMessageId: string, error: unknown) {
    setters.setAgents((current) => current.map((agent) => (
      agent.id === agentId ? { ...agent, state: "failed", progress: 100 } : agent
    )));
    setters.setBuildState("failed");
    setters.setPreviewState("live");
    const rawMessage = error instanceof Error ? error.message : "Agent task failed";
    logs.appendLog(rawMessage, "AI Chat", "error");
    updateAssistantMessage(target, assistantMessageId, userFacingAgentError(rawMessage));
  }

  function updateAssistantMessage(target: ResolvedAgentTarget, messageId: string, text: string, app?: ChatResponse["app"]) {
    updateChatMessages(target.chatProjectId, (current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const next = { ...message, text };
      if (app !== undefined) {
        if (app) next.app = app;
        else delete next.app;
      }
      return next;
    }));
  }

  function streamAssistantMessage(target: ResolvedAgentTarget, messageId: string, fullText: string, app?: ChatResponse["app"]) {
    if (streamingRef.current) {
      streamingRef.current.cancel();
      streamingRef.current = null;
    }

    const text = fullText ?? "";
    if (text.length === 0) {
      updateAssistantMessage(target, messageId, text, app);
      return;
    }

    const chunks = text.match(/\S+\s*|\s+/g) ?? [text];
    const cursor = "▍";
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const cancel = () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      updateAssistantMessage(target, messageId, text, app);
    };
    streamingRef.current = { cancel };

    const tick = () => {
      if (cancelled) return;
      index += 1;
      const done = index >= chunks.length;
      const partial = chunks.slice(0, index).join("");
      updateChatMessages(target.chatProjectId, (current) => current.map((message) => {
        if (message.id !== messageId) return message;
        const next = { ...message, text: done ? partial : `${partial}${cursor}` };
        if (done && app !== undefined) {
          if (app) next.app = app;
          else delete next.app;
        }
        return next;
      }));
      if (done) {
        streamingRef.current = null;
        return;
      }
      const delay = 15 + Math.random() * 30;
      timer = setTimeout(tick, delay);
    };

    tick();
  }

  return { startAgent };
}
