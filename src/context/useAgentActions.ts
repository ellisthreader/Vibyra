import { useRef } from "react";
import * as Haptics from "expo-haptics";
import { LogEvent } from "../types/domain";
import type { AgentStartOptions } from "../types/chatTools";
import { ChatResponse, isAppSessionExpiredError } from "../utils/appApi";
import { appApiStreamChat } from "../utils/appApiStream";
import { impact } from "../utils/haptics";
import { useAppState } from "./useAppState";
import { AgentStartResult, calculatePromptMoney, roundMoney } from "./agentTypes";
import type { AgentStartTarget } from "./appContextTypes";
import { makeOptimisticAgent, resolveAgentTarget } from "./agentActionHelpers";
import { useAgentChatMessages } from "./useAgentChatMessages";
import { useAgentResultHandlers } from "./useAgentResultHandlers";
import { chatUsageLimitBlockMessage } from "./chatUsageLimit";
import { normalizeAgentReply } from "../utils/files";
import { withProjectBriefPrompt } from "../utils/projectBriefs";
import { withProjectMemoryPrompt } from "../utils/projectMemory";
import { shouldAttachFileContext } from "./agentContextPayload";
import { appendPendingEditReminder } from "./agentPendingEdits";
import { buildAgentProjectFiles } from "./agentProjectFiles";
import { resolveAgentPrompt } from "./agentPromptResolution";
import {
  inferLiveEditFile,
  pendingProjectEdit,
  shouldShowLiveEditActivity,
  shouldUseAdviceContext,
  shouldUseBuildChatMode,
  shouldUseDesktopAgentMode,
  toolFromSkill
} from "./agentModeDecisions";
type Store = ReturnType<typeof useAppState>;
type Requests = { agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>; };
type Logs = { appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void; appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void; advanceWorkflow: (index: number) => void; };
type AuthSession = { expireSession: (message?: string) => void; };
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

    const {
      fileAttachments,
      imageAttachments,
      intentText,
      messageAttachments,
      promptBody,
      skill,
      skillId,
      visibleText
    } = resolveAgentPrompt(trimmed, options, state.chatSkills);

    const chatTarget = resolveAgentTarget(state, derived, target);
    const selectedModel = options.model?.trim() || state.selectedChatModel || state.selectedModel;
    const buildMode = shouldUseBuildChatMode(intentText, skill?.mode);
    const desktopAgentMode = imageAttachments.length === 0 && state.desktopPermissionMode !== "read"
      && shouldUseDesktopAgentMode(intentText, skillId, skill?.mode, buildMode, state.connection, chatTarget.project.path);
    const pendingEdit = desktopAgentMode ? pendingProjectEdit(state.chatThreads[chatTarget.chatProjectId] ?? []) : null;
    if (pendingEdit) {
      appendPendingEditReminder(setters.setChatThreads, setters.setTaskText, chatTarget.chatProjectId, visibleText, pendingEdit.file);
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
    }, messageAttachments);
    const optimisticAgent = makeOptimisticAgent(chatTarget, visibleText, selectedModel);
    const richContextMode = buildMode || shouldUseAdviceContext(intentText, skill?.mode);
    const shouldScopeToFile = Boolean(chatTarget.file && fileContextEnabled && !desktopAgentMode && !buildMode);
    const scopedPrompt = shouldScopeToFile
      ? `In ${chatTarget.file?.path}: ${promptBody}`
      : promptBody;
    const projectBrief = state.chatProjects[chatTarget.chatProjectId]?.brief
      ?? state.chatProjects[chatTarget.projectId]?.brief
      ?? chatTarget.project.brief;
    const projectMemory = state.projectMemories[chatTarget.chatProjectId] ?? state.projectMemories[chatTarget.projectId];
    const prompt = withProjectMemoryPrompt(projectMemory, withProjectBriefPrompt(projectBrief, scopedPrompt));
    const earned = calculatePromptMoney(visibleText);

    impact(Haptics.ImpactFeedbackStyle.Medium);
    setters.setPromptMoney((current) => ({
      total: roundMoney(current.total + earned),
      count: current.count + 1,
      lastEarned: earned,
      longestPromptLength: Math.max(current.longestPromptLength, visibleText.length)
    }));
    setters.setAgents((current) => [optimisticAgent, ...current]);
    setters.setBuildState(desktopAgentMode || buildMode ? "building" : "idle");
    setters.setPreviewState(desktopAgentMode || buildMode ? "refreshing" : "live");
    setters.setLastPrompt(visibleText);

    try {
      if (state.connection && desktopAgentMode) {
        const history = state.chatThreads[chatTarget.chatProjectId] ?? [];
        const projectFiles = await buildAgentProjectFiles(state, requests, chatTarget, intentText, fileAttachments, true);
        const result = await requests.agentRequest<AgentStartResult>("/agents/start", {
          method: "POST",
          body: JSON.stringify({
            apply: state.editApprovals[chatTarget.projectId] === "always",
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
        projectFiles: await buildAgentProjectFiles(state, requests, chatTarget, intentText, fileAttachments, Boolean(state.connection)),
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
