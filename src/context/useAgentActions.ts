import { useRef } from "react";
import * as Haptics from "expo-haptics";
import { LogEvent } from "../types/domain";
import { appApiRequest, appApiStreamChat, ChatResponse, isAppSessionExpiredError } from "../utils/appApi";
import { impact } from "../utils/haptics";
import { useAppState } from "./useAppState";
import { AgentStartResult, calculatePromptMoney, roundMoney } from "./agentTypes";
import type { AgentStartTarget } from "./appContextTypes";
import { makeOptimisticAgent, resolveAgentTarget } from "./agentActionHelpers";
import { useAgentChatMessages } from "./useAgentChatMessages";
import { useAgentResultHandlers } from "./useAgentResultHandlers";
import { applyLocalSkillPrompt, mergeChatSkills } from "../utils/chatSkills";
import { normalizeAgentReply } from "../utils/files";
import { withProjectBriefPrompt } from "../utils/projectBriefs";
import { projectFileContext, shouldAttachFileContext, type ProjectFileContext } from "./agentContextPayload";
type Store = ReturnType<typeof useAppState>;
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
  appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void;
  advanceWorkflow: (index: number) => void;
};
type AuthSession = {
  expireSession: (message?: string) => void;
};
export function useAgentActions(store: Store, requests: Requests, logs: Logs, authSession?: AuthSession) {
  const { state, derived, setters } = store;
  const agentRequestingRef = useRef(false);
  const streamingRef = useRef<(() => void) | null>(null);
  const messages = useAgentChatMessages(store, logs, streamingRef);
  const results = useAgentResultHandlers(store, logs, messages);

  async function startAgent(target?: AgentStartTarget, promptOverride?: string) {
    const trimmed = (promptOverride ?? state.taskText).trim();
    if (!trimmed || state.agentRequesting || agentRequestingRef.current) return false;

    if (streamingRef.current) {
      streamingRef.current();
      streamingRef.current = null;
    }

    const skillMatch = trimmed.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
    const allSkills = mergeChatSkills(state.chatSkills);
    const skill = skillMatch ? allSkills.find((s) => s.id === skillMatch[1].toLowerCase()) : undefined;
    const skillId = skill?.id;
    const userText = skill ? (skillMatch?.[2] ?? "").trim() : trimmed;
    const visibleText = skill
      ? (userText ? `${skill.slash} ${userText}` : skill.slash)
      : trimmed;

    const chatTarget = resolveAgentTarget(state, derived, target);
    const selectedModel = state.selectedChatModel || state.selectedModel;
    agentRequestingRef.current = true;
    setters.setAgentRequesting(true);
    const intentText = skill ? userText : trimmed;
    const buildMode = shouldUseBuildChatMode(intentText, skill?.mode);
    const desktopAgentMode = false;
    const runMode = desktopAgentMode || buildMode ? "build" : "chat";
    const fileContextEnabled = shouldAttachFileContext(intentText, chatTarget.file);
    const messageTarget = fileContextEnabled ? chatTarget : { ...chatTarget, file: null };
    const liveEditFile = fileContextEnabled && shouldShowLiveEditActivity(intentText, skill?.mode, buildMode)
      ? inferLiveEditFile(chatTarget.file?.path, intentText)
      : undefined;
    const assistantMessageId = messages.appendPendingChat(messageTarget, visibleText, selectedModel, {
      route: state.connection && desktopAgentMode ? "desktop" : "cloud",
      mode: runMode,
      activeFile: liveEditFile
    });
    const optimisticAgent = makeOptimisticAgent(chatTarget, visibleText, selectedModel);
    const richContextMode = buildMode || shouldUseAdviceContext(intentText, skill?.mode);
    const promptBody = skill
      ? ("promptPrefix" in skill ? applyLocalSkillPrompt(skill, userText) : (userText || skill.label))
      : trimmed;
    const shouldScopeToFile = Boolean(chatTarget.file && fileContextEnabled && !desktopAgentMode && !buildMode);
    const scopedPrompt = shouldScopeToFile
      ? `In ${chatTarget.file?.path}: ${promptBody}`
      : promptBody;
    const projectBrief = state.chatProjects[chatTarget.chatProjectId]?.brief
      ?? state.chatProjects[chatTarget.projectId]?.brief
      ?? chatTarget.project.brief;
    const prompt = withProjectBriefPrompt(projectBrief, scopedPrompt);
    const earned = calculatePromptMoney(trimmed);

    impact(Haptics.ImpactFeedbackStyle.Medium);
    setters.setPromptMoney((current) => ({
      total: roundMoney(current.total + earned),
      count: current.count + 1,
      lastEarned: earned,
      longestPromptLength: Math.max(current.longestPromptLength, trimmed.length)
    }));
    setters.setAgents((current) => [optimisticAgent, ...current]);
    setters.setBuildState(desktopAgentMode || buildMode ? "building" : "idle");
    setters.setPreviewState(desktopAgentMode || buildMode ? "refreshing" : "live");
    setters.setLastPrompt(trimmed);

    try {
      if (state.connection && desktopAgentMode) {
        const result = await requests.agentRequest<AgentStartResult>("/agents/start", {
          method: "POST",
          body: JSON.stringify({
            apply: state.editApprovals[chatTarget.projectId] === "always",
            model: selectedModel,
            projectId: chatTarget.projectId,
            projectPath: chatTarget.project.path,
            prompt,
            reasoningEffort: state.reasoningEffort
          })
        });
        results.finishRealAgent(chatTarget, result, optimisticAgent.id, assistantMessageId);
        return true;
      }

      if (!state.authToken) {
        throw new Error("Log in or create an account to use Vibyra AI chat.");
      }

      const filesInActiveProject = chatTarget.projectId === state.selectedProjectId ? state.files : [];
      const fileBody = chatTarget.file && fileContextEnabled && richContextMode && !buildMode
        ? (chatTarget.file.body || "").slice(0, 1200)
        : "";
      const filePath = chatTarget.file && fileContextEnabled && !buildMode ? chatTarget.file.path : "";
      const historyWindow = buildMode ? 4 : 3;
      const historyCharCap = buildMode ? 1200 : 600;
      const history = state.chatThreads[chatTarget.chatProjectId] ?? [];

      const streamBody = {
        fileBody,
        filePath,
        history: history
          .filter((message) => message.id !== "welcome" && message.text.trim() && message.text !== "Working on it...")
          .slice(-historyWindow)
          .map((message) => ({
            role: message.role,
            text: (message.role === "assistant" ? normalizeAgentReply(message.text) : message.text).slice(0, historyCharCap)
          })),
        model: selectedModel,
        mode: runMode,
        project: chatTarget.project.name,
        projectFiles: await projectFileContext(filesInActiveProject, intentText, state.connection ? async (path) => (
          await requests.agentRequest<{ file: typeof state.files[number] }>(`/files/read?projectId=${encodeURIComponent(chatTarget.projectId)}&path=${encodeURIComponent(path)}`)
        ).file : undefined, state.connection ? async (query) => (
          await requests.agentRequest<{ files: ProjectFileContext[] }>(`/desktop/context?projectId=${encodeURIComponent(chatTarget.projectId)}&q=${encodeURIComponent(query)}`)
        ).files ?? [] : undefined),
        prompt,
        reasoningEffort: state.reasoningEffort,
        skill: skillId ?? ""
      };
      const result = await appApiStreamChat<ChatResponse>(streamBody, state.authToken, {
        onChunk: (delta) => messages.appendStreamingDelta(messageTarget, assistantMessageId, delta)
      });
      results.finishStreamedOpenRouterAgent(messageTarget, result, optimisticAgent.id, assistantMessageId);
      return true;
    } catch (error) {
      if (isAppSessionExpiredError(error)) {
        authSession?.expireSession("Your Vibyra login needs refreshing before AI chat can continue.");
      }
      messages.failAgent(messageTarget, optimisticAgent, assistantMessageId, error);
      return false;
    } finally {
      agentRequestingRef.current = false;
      setters.setAgentRequesting(false);
    }
  }

  return { startAgent };
}

function shouldUseBuildChatMode(text: string, skillMode?: string) {
  if (skillMode === "build") return true;
  const prompt = text.trim().toLowerCase();
  if (/^the runnable preview for .+ crashed\./i.test(prompt) || /\bcaptured preview diagnostics:/i.test(prompt)) return true;
  const buildVerb = "(build|create|make|generate|design|prototype)";
  const target = "\\b(app|tool|page|tracker|dashboard|calculator|game|ui|widget|landing|form|site|website|screen|preview)\\b";
  return (new RegExp(`^(please\\s+|pls\\s+)?${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(can|could|would)\\s+(you|u)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(i\\s+want\\s+you\\s+to|i\\s+need\\s+you\\s+to|need\\s+you\\s+to)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || /\b(?:fix|repair|debug|resolve)\b[\s\S]{0,80}\b(?:preview|app|site|website|page|html|screen|ui)\b/.test(prompt));
}

function shouldUseAdviceContext(text: string, skillMode?: string) {
  if (skillMode === "chat") return true;
  const prompt = text.toLowerCase();
  return /\b(what|why|how|where|when|which|who|review|explain|audit|inspect|look|suggest|advice|recommend|feedback|nicer|better|improve)\b/.test(prompt);
}

function shouldShowLiveEditActivity(text: string, skillMode: string | undefined, buildMode: boolean) {
  if (buildMode || skillMode === "build") return true;
  const prompt = text.trim().toLowerCase();
  const editVerb = "(add|build|change|create|delete|design|edit|fix|generate|implement|make|modify|refactor|remove|replace|rewrite|update)";
  return new RegExp(`\\b${editVerb}\\b`).test(prompt)
    && /\b(code|component|file|screen|ui|style|css|html|app|page|website|site|function|bug)\b/.test(prompt);
}

function inferLiveEditFile(selectedPath: string | undefined, text: string) {
  const prompt = text.trim().toLowerCase();
  if (selectedPath && /\b(this|current|selected)\s+file\b|\b(edit|fix|update|change|refactor|rewrite|replace)\b/.test(prompt)) {
    return selectedPath;
  }
  if (/\b(css|styles?|theme|layout|spacing|color|visual|polish)\b/.test(prompt)) return "App.css";
  if (/\b(html|landing|website|site|page)\b/.test(prompt)) return "index.html";
  return "App.js";
}
