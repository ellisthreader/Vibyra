import type { GeneratedApp, Project } from "../../../types/domain";
import type { ChatToolMode, GeneratedImage } from "../../../types/chatTools";
import { chatToolModelOverride, chatToolSkillId, type ChatStartOptions } from "../../../types/chatTools";
import { generatePublishAsset } from "../../../utils/communityApi";
import { type ChatResponse } from "../../../utils/appApi";
import { appApiStreamChat } from "../../../utils/appApiStream";
import { makeId } from "../../../utils/ids";
import { userFacingAgentError } from "../../../context/agentErrors";
import type { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type ReplyFn = (reply: string, project?: Project, preview?: GeneratedApp) => void;

export function createWorkspaceToolHandlers(s: WorkspaceState, runtime: Runtime) {
  const { app } = s;

  async function handleToolMode(
    prompt: string,
    tool: ChatToolMode,
    detached: boolean,
    target: ReturnType<Runtime["activeProjectTarget"]>,
    reply: ReplyFn,
    imageAttachments: ChatStartOptions["imageAttachments"] = [],
    modelOverride?: string
  ) {
    if (tool === "image") {
      await createImage(prompt, detached, target, reply);
      return true;
    }
    if (tool === "analyze" && detached) {
      reply("Open a project chat first so I can analyze that app's files.");
      return true;
    }
    const skillId = chatToolSkillId(tool);
    const toolModel = modelOverride || chatToolModelOverride(tool);
    if (!skillId) return false;
    if (detached) {
      await runDetachedCloudTool(prompt, tool, skillId, toolModel);
      return true;
    }
    await app.startAgent(target, prompt, { imageAttachments, skillId, ...(toolModel ? { model: toolModel } : {}) });
    return true;
  }

  async function runDetachedCloudTool(prompt: string, tool: Exclude<ChatToolMode, "image">, skillId: string, modelOverride?: string) {
    if (!app.authToken) {
      runtime.addDetachedChatReply(prompt, "Log in or create an account to use Vibyra AI chat.");
      return;
    }
    const selectedModel = modelOverride || app.selectedChatModel || app.selectedModel;
    const { assistantId, chatId } = addDetachedToolPending(prompt, tool, selectedModel);
    try {
      const result = await appApiStreamChat<ChatResponse>({
        history: (app.detachedChatThreads[chatId] ?? [])
          .filter((message) => message.text.trim() && message.text !== "Working on it...")
          .slice(-3)
          .map((message) => ({ role: message.role, text: message.text.slice(0, 600) })),
        model: selectedModel,
        mode: "chat",
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

  function addDetachedToolPending(prompt: string, tool: Exclude<ChatToolMode, "image">, selectedModel: string) {
    const assistantId = makeId("new-chat-assistant");
    const chatId = runtime.appendDetachedMessages(prompt, [
      { id: makeId("new-chat-user"), role: "user", text: prompt },
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

  function finishDetachedTool(chatId: string, messageId: string, result: ChatResponse) {
    runtime.updateDetachedMessage(chatId, messageId, (message) => ({
      ...message,
      text: result.reply || message.text,
      creditCost: result.creditCost,
      runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus
    }));
  }

  function failDetachedTool(chatId: string, messageId: string, error: string) {
    runtime.updateDetachedMessage(chatId, messageId, (message) => ({
      ...message,
      text: error,
      runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
    }));
  }

  async function createImage(prompt: string, detached: boolean, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    if (!app.authToken) {
      reply("Log in before generating images.");
      return;
    }
    const pendingMessageId = detached
      ? addDetachedImageGenerationPending(prompt)
      : app.addLocalImageGenerationPending(prompt, target);
    try {
      const result = await generatePublishAsset({
        authToken: app.authToken,
        description: target.project.name,
        kind: "screenshot",
        prompt,
        title: target.project.name || "Vibyra image"
      });
      if (result.user) app.applyRemoteUsage(result.user);
      const image: GeneratedImage = {
        id: `generated-image-${Date.now()}`,
        provider: result.provider,
        title: "Generated image",
        url: result.imageUrl
      };
      detached ? finishDetachedGeneratedImage(pendingMessageId, image) : app.finishLocalGeneratedImage(pendingMessageId, image, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed. Try again.";
      detached ? failDetachedImageGeneration(pendingMessageId, message) : app.failLocalImageGeneration(pendingMessageId, message, target);
    }
  }

  function addDetachedImageGenerationPending(prompt: string) {
    const assistantId = makeId("new-chat-assistant");
    const chatId = runtime.appendDetachedMessages(prompt, [
      { id: makeId("new-chat-user"), role: "user", text: prompt },
      {
        id: assistantId,
        role: "assistant",
        text: "Working on it...",
        runStatus: { route: "cloud", mode: "chat", status: "running", tool: "image", startedAt: Date.now() }
      }
    ]);
    app.setTaskText("");
    return `${chatId}:${assistantId}`;
  }

  function finishDetachedGeneratedImage(messageKey: string, image: GeneratedImage) {
    const { chatId, messageId } = splitDetachedMessageKey(messageKey);
    runtime.updateDetachedMessage(chatId, messageId, (message) => ({
      ...message,
      text: `Created **${image.title}**.`,
      generatedImage: image,
      runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus
    }));
  }

  function failDetachedImageGeneration(messageKey: string, error: string) {
    const { chatId, messageId } = splitDetachedMessageKey(messageKey);
    runtime.updateDetachedMessage(chatId, messageId, (message) => ({
      ...message,
      text: error,
      runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
    }));
  }

  return { handleToolMode };
}

function splitDetachedMessageKey(key: string) {
  const separator = key.indexOf(":");
  return {
    chatId: key.slice(0, separator),
    messageId: key.slice(separator + 1)
  };
}
