import { useRef } from "react";
import * as Haptics from "expo-haptics";
import { LogEvent } from "../types/domain";
import type { AgentStartOptions, ChatToolMode } from "../types/chatTools";
import { appApiStreamChat, ChatResponse, isAppSessionExpiredError } from "../utils/appApi";
import { impact } from "../utils/haptics";
import { useAppState } from "./useAppState";
import { AgentStartResult, calculatePromptMoney, roundMoney } from "./agentTypes";
import type { AgentStartTarget } from "./appContextTypes";
import { makeOptimisticAgent, resolveAgentTarget } from "./agentActionHelpers";
import { useAgentChatMessages } from "./useAgentChatMessages";
import { useAgentResultHandlers } from "./useAgentResultHandlers";
import { chatUsageLimitBlockMessage } from "./chatUsageLimit";
import { applyLocalSkillPrompt, mergeChatSkills } from "../utils/chatSkills";
import { normalizeAgentReply } from "../utils/files";
import { withProjectBriefPrompt } from "../utils/projectBriefs";
import { withProjectMemoryPrompt } from "../utils/projectMemory";
import { projectFileContext, shouldAttachFileContext, type ProjectFileContext } from "./agentContextPayload";
import { makeId } from "../utils/ids";
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

  async function startAgent(target?: AgentStartTarget, promptOverride?: string, options: AgentStartOptions = {}) {
    const trimmed = (promptOverride ?? state.taskText).trim();
    if (!trimmed || state.agentRequesting || agentRequestingRef.current) return false;
    const limitBlock = chatUsageLimitBlockMessage();
    if (limitBlock) {
      logs.appendLog(limitBlock, "AI Chat", "warning");
      return false;
    }

    if (streamingRef.current) {
      streamingRef.current();
      streamingRef.current = null;
    }

    const skillMatch = options.skillId ? null : trimmed.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
    const allSkills = mergeChatSkills(state.chatSkills);
    const requestedSkill = options.skillId?.trim().toLowerCase();
    const skill = requestedSkill
      ? allSkills.find((s) => s.id === requestedSkill) ?? { id: requestedSkill, slash: `/${requestedSkill}`, label: requestedSkill, description: "", category: "tool", mode: "chat" as const }
      : skillMatch ? allSkills.find((s) => s.id === skillMatch[1].toLowerCase()) : undefined;
    const skillId = requestedSkill || skill?.id;
    const userText = skill && skillMatch ? (skillMatch?.[2] ?? "").trim() : trimmed;
    const imageAttachments = (options.imageAttachments ?? []).slice(0, 3).map((attachment) => ({
      url: attachment.dataUrl,
      name: attachment.name,
      mimeType: attachment.mimeType,
      ...(attachment.width ? { width: attachment.width } : {}),
      ...(attachment.height ? { height: attachment.height } : {})
    }));
    const visibleText = skill
      ? (skillMatch ? (userText ? `${skill.slash} ${userText}` : skill.slash) : trimmed)
      : trimmed;

    const chatTarget = resolveAgentTarget(state, derived, target);
    const selectedModel = state.selectedChatModel || state.selectedModel;
    const intentText = skill ? userText : trimmed;
    const buildMode = shouldUseBuildChatMode(intentText, skill?.mode);
    const desktopAgentMode = imageAttachments.length === 0 && state.desktopPermissionMode !== "read"
      && shouldUseDesktopAgentMode(intentText, skillId, skill?.mode, buildMode, state.connection, chatTarget.project.path);
    const pendingEdit = desktopAgentMode ? pendingProjectEdit(state.chatThreads[chatTarget.chatProjectId] ?? []) : null;
    if (pendingEdit) {
      appendPendingEditReminder(chatTarget.chatProjectId, visibleText, pendingEdit.file);
      return false;
    }
    agentRequestingRef.current = true;
    setters.setAgentRequesting(true);
    const runMode = desktopAgentMode || buildMode ? "build" : "chat";
    const fileContextEnabled = shouldAttachFileContext(intentText, chatTarget.file);
    const messageTarget = fileContextEnabled ? chatTarget : { ...chatTarget, file: null };
    const liveEditFile = fileContextEnabled && shouldShowLiveEditActivity(intentText, skill?.mode, buildMode)
      ? inferLiveEditFile(chatTarget.file?.path, intentText)
      : undefined;
    const assistantMessageId = messages.appendPendingChat(messageTarget, visibleText, selectedModel, {
      route: state.connection && desktopAgentMode ? "desktop" : "cloud",
      mode: runMode,
      activeFile: liveEditFile,
      tool: toolFromSkill(skillId)
    });
    const optimisticAgent = makeOptimisticAgent(chatTarget, visibleText, selectedModel);
    const richContextMode = buildMode || shouldUseAdviceContext(intentText, skill?.mode);
    const promptBody = skill && !requestedSkill
      ? ("promptPrefix" in skill ? applyLocalSkillPrompt(skill, userText) : (userText || skill.label))
      : trimmed;
    const shouldScopeToFile = Boolean(chatTarget.file && fileContextEnabled && !desktopAgentMode && !buildMode);
    const scopedPrompt = shouldScopeToFile
      ? `In ${chatTarget.file?.path}: ${promptBody}`
      : promptBody;
    const projectBrief = state.chatProjects[chatTarget.chatProjectId]?.brief
      ?? state.chatProjects[chatTarget.projectId]?.brief
      ?? chatTarget.project.brief;
    const projectMemory = state.projectMemories[chatTarget.chatProjectId] ?? state.projectMemories[chatTarget.projectId];
    const prompt = withProjectMemoryPrompt(projectMemory, withProjectBriefPrompt(projectBrief, scopedPrompt));
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
        const filesInActiveProject = chatTarget.projectId === state.selectedProjectId ? state.files : [];
        const history = state.chatThreads[chatTarget.chatProjectId] ?? [];
        const projectFiles = await projectFileContext(filesInActiveProject, intentText, async (path) => (
          await requests.agentRequest<{ file: typeof state.files[number] }>(`/files/read?projectId=${encodeURIComponent(chatTarget.projectId)}&path=${encodeURIComponent(path)}`)
        ).file, async (query) => (
          await requests.agentRequest<{ files: ProjectFileContext[] }>(`/desktop/context?projectId=${encodeURIComponent(chatTarget.projectId)}&q=${encodeURIComponent(query)}`)
        ).files ?? []);
        const result = await requests.agentRequest<AgentStartResult>("/agents/start", {
          method: "POST",
          body: JSON.stringify({
            apply: state.desktopPermissionMode === "auto" || state.editApprovals[chatTarget.projectId] === "always",
            history: history
              .filter((message) => message.id !== "welcome" && message.text.trim() && message.text !== "Working on it...")
              .slice(-6)
              .map((message) => ({
                role: message.role,
                text: (message.role === "assistant" ? normalizeAgentReply(message.text) : message.text).slice(0, 1600)
              })),
            model: selectedModel,
            projectId: chatTarget.projectId,
            projectFiles,
            projectPath: chatTarget.project.path,
            selectedFile: chatTarget.file && fileContextEnabled ? {
              path: chatTarget.file.path,
              language: chatTarget.file.language,
              body: (chatTarget.file.body || "").slice(0, 12000)
            } : null,
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
        imageAttachments,
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

  function appendPendingEditReminder(projectId: string, prompt: string, file?: string) {
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: [
        ...(current[projectId] ?? []),
        { id: makeId("chat-user"), role: "user", text: prompt, file },
        {
          id: makeId("chat-assistant"),
          role: "assistant",
          text: "There are generated edits waiting for your approval. Review the pending code changes card, then choose Allow, Allow always, or No before I start another run.",
          file
        }
      ]
    }));
    setters.setTaskText("");
  }
}

function pendingProjectEdit(messages: Store["state"]["chatMessages"]) {
  return [...messages].reverse().find((message) => message.editApproval === "pending" && Boolean(message.pendingApplyId)) ?? null;
}

function shouldUseBuildChatMode(text: string, skillMode?: string) {
  if (skillMode === "build") return true;
  const prompt = text.trim().toLowerCase();
  if (/^the live preview for .+ crashed while running the existing project\./i.test(prompt)) return false;
  if (/^the runnable preview for .+ crashed\./i.test(prompt) || /\bcaptured preview diagnostics:/i.test(prompt)) return true;
  const buildVerb = "(build|create|make|generate|design|prototype)";
  const target = "\\b(app|tool|page|tracker|dashboard|calculator|game|ui|widget|landing|form|site|website|screen|preview)\\b";
  return (new RegExp(`^(please\\s+|pls\\s+)?${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(can|could|would)\\s+(you|u)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(i\\s+want\\s+you\\s+to|i\\s+need\\s+you\\s+to|need\\s+you\\s+to)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || /\b(?:fix|repair|debug|resolve)\b[\s\S]{0,80}\b(?:preview|app|site|website|page|html|screen|ui)\b/.test(prompt));
}

function toolFromSkill(skillId?: string): ChatToolMode | undefined {
  if (skillId === "research" || skillId === "web" || skillId === "analyze") return skillId;
  return undefined;
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

function shouldUseDesktopAgentMode(
  text: string,
  skillId: string | undefined,
  skillMode: string | undefined,
  buildMode: boolean,
  connection: Store["state"]["connection"],
  projectPath: string | undefined
) {
  if (!connection || !projectPath) return false;
  if (/^the runnable preview for .+ crashed\./i.test(text.trim())) return false;
  if (skillId && ["analyze", "explain", "plan", "research", "review", "publish", "ship", "web"].includes(skillId)) return false;
  if (buildMode || skillMode === "build") return true;
  if (skillId && ["debug", "fix", "refactor", "style", "design"].includes(skillId)) return true;

  const prompt = text.trim().toLowerCase();
  const editVerb = "\\b(add|build|change|create|delete|design|edit|fix|generate|implement|make|modify|polish|refactor|remove|repair|replace|rewrite|update)\\b";
  const localTarget = "\\b(app|bug|code|component|css|error|file|function|html|issue|layout|page|preview|screen|site|style|test|ui|website)\\b";
  return new RegExp(editVerb).test(prompt) && new RegExp(localTarget).test(prompt);
}
