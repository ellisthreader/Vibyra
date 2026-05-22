import type { GeneratedApp, Project } from "../../../types/domain";
import type { GeneratedImage } from "../../../types/chatTools";
import { generatePublishAsset } from "../../../utils/communityApi";
import { chatToolRunKey, isSameRunningChatToolRun, remainingChatToolProgressMs, type ChatToolRunKey } from "../../../utils/chatToolProgress";
import { makeId } from "../../../utils/ids";
import type { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type ReplyFn = (reply: string, project?: Project, preview?: GeneratedApp) => void;

export function createImageToolActions(app: WorkspaceState["app"], runtime: Runtime) {
  async function createImage(
    prompt: string,
    displayPrompt: string,
    detached: boolean,
    target: ReturnType<Runtime["activeProjectTarget"]>,
    reply: ReplyFn
  ) {
    if (!app.authToken) {
      reply("Log in before generating images.");
      return;
    }
    const pendingMessageId = detached
      ? addDetachedImageGenerationPending(displayPrompt)
      : app.addLocalImageGenerationPending(displayPrompt, target);
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

  function finishDetachedGeneratedImage(messageKey: string, image: GeneratedImage, expectedRun?: ChatToolRunKey | null) {
    const { chatId, messageId } = splitDetachedMessageKey(messageKey);
    runtime.updateDetachedMessage(chatId, messageId, (message) => {
      if (!isSameRunningChatToolRun(message.runStatus, expectedRun ?? null)) return message;
      const delay = remainingChatToolProgressMs(message.runStatus);
      if (delay > 0) {
        const runKey = expectedRun ?? chatToolRunKey(message.runStatus);
        setTimeout(() => finishDetachedGeneratedImage(messageKey, image, runKey), delay);
        return message;
      }
      return {
        ...message,
        text: `Created **${image.title}**.`,
        generatedImage: image,
        runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus
      };
    });
  }

  function failDetachedImageGeneration(messageKey: string, error: string) {
    const { chatId, messageId } = splitDetachedMessageKey(messageKey);
    runtime.updateDetachedMessage(chatId, messageId, (message) => ({
      ...message,
      text: error,
      runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
    }));
  }

  return { createImage };
}

function splitDetachedMessageKey(key: string) {
  const separator = key.indexOf(":");
  return {
    chatId: key.slice(0, separator),
    messageId: key.slice(separator + 1)
  };
}
