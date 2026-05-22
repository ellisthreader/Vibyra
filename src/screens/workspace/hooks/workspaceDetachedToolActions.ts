import type { ChatFileAttachment, ChatToolMode } from "../../../types/chatTools";
import { type ChatStartOptions } from "../../../types/chatTools";
import { fileAttachmentsToProjectFiles, imageAttachmentsToApi } from "../../../utils/chatFileAttachments";
import { type ChatResponse } from "../../../utils/appApi";
import { appApiStreamChat } from "../../../utils/appApiStream";
import { chatToolRunKey, isSameRunningChatToolRun, remainingChatToolProgressMs, type ChatToolRunKey } from "../../../utils/chatToolProgress";
import { makeId } from "../../../utils/ids";
import { userFacingAgentError } from "../../../context/agentErrors";
import type { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;

export function createDetachedToolActions(app: WorkspaceState["app"], runtime: Runtime) {
  async function runDetachedCloudTool(
    prompt: string,
    displayPrompt: string,
    tool: Exclude<ChatToolMode, "image">,
    skillId: string,
    modelOverride?: string,
    imageAttachments: ChatStartOptions["imageAttachments"] = [],
    fileAttachments: ChatFileAttachment[] = []
  ) {
    if (!app.authToken) {
      runtime.addDetachedChatReply(displayPrompt, "Log in or create an account to use Vibyra AI chat.");
      return;
    }
    const selectedModel = modelOverride || app.selectedChatModel || app.selectedModel;
    const { assistantId, chatId } = addDetachedToolPending(displayPrompt, tool, selectedModel, imageAttachments, fileAttachments);
    try {
      const result = await appApiStreamChat<ChatResponse>({
        history: detachedHistory(chatId),
        imageAttachments: imageAttachmentsToApi(imageAttachments ?? []),
        model: selectedModel,
        mode: "chat",
        projectFiles: fileAttachmentsToProjectFiles(fileAttachments),
        prompt,
        reasoningEffort: app.reasoningEffort,
        skill: skillId
      }, app.authToken, {
        onChunk: (delta) => appendDetachedToolDelta(chatId, assistantId, delta)
      });
      if (result.user) app.applyRemoteUsage(result.user);
      finishDetachedTool(chatId, assistantId, result);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("session")) {
        app.expireSession("Your Vibyra login needs refreshing before AI chat can continue.");
      }
      failDetachedTool(chatId, assistantId, userFacingAgentError(error));
    }
  }

  function detachedHistory(chatId: string) {
    return (app.detachedChatThreads[chatId] ?? [])
      .filter((message) => message.text.trim() && message.text !== "Working on it...")
      .slice(-3)
      .map((message) => ({ role: message.role, text: message.text.slice(0, 600) }));
  }

  function addDetachedToolPending(
    prompt: string,
    tool: Exclude<ChatToolMode, "image">,
    selectedModel: string,
    imageAttachments: ChatStartOptions["imageAttachments"] = [],
    fileAttachments: ChatFileAttachment[] = []
  ) {
    const assistantId = makeId("new-chat-assistant");
    const chatId = runtime.appendDetachedMessages(prompt, [
      {
        id: makeId("new-chat-user"),
        role: "user",
        text: prompt,
        ...(imageAttachments?.length || fileAttachments.length ? {
          attachments: {
            ...(imageAttachments?.length ? { imageAttachments } : {}),
            ...(fileAttachments.length ? { fileAttachments } : {})
          }
        } : {})
      },
      {
        id: assistantId,
        role: "assistant",
        text: "Working on it...",
        assistantModel: selectedModel,
        runStatus: { route: "cloud", mode: "chat", status: "running", tool, startedAt: Date.now() }
      }
    ]);
    app.setTaskText("");
    return { assistantId, chatId };
  }

  function appendDetachedToolDelta(chatId: string, messageId: string, delta: string) {
    if (!delta) return;
    runtime.updateDetachedMessage(chatId, messageId, (message) => {
      if (message.id !== messageId) return message;
      const previous = message.text === "Working on it..." ? "" : message.text;
      return { ...message, text: previous + delta };
    });
  }

  function finishDetachedTool(chatId: string, messageId: string, result: ChatResponse, expectedRun?: ChatToolRunKey | null) {
    runtime.updateDetachedMessage(chatId, messageId, (message) => {
      if (!isSameRunningChatToolRun(message.runStatus, expectedRun ?? null)) return message;
      const delay = remainingChatToolProgressMs(message.runStatus);
      if (delay > 0) {
        const runKey = expectedRun ?? chatToolRunKey(message.runStatus);
        setTimeout(() => finishDetachedTool(chatId, messageId, result, runKey), delay);
        return message;
      }
      return {
        ...message,
        text: result.reply || message.text,
        creditCost: result.creditCost,
        runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus
      };
    });
  }

  function failDetachedTool(chatId: string, messageId: string, error: string) {
    runtime.updateDetachedMessage(chatId, messageId, (message) => ({
      ...message,
      text: error,
      runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
    }));
  }

  return { runDetachedCloudTool };
}
