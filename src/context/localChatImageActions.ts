import type { GeneratedImage } from "../types/chatTools";
import { chatToolRunKey, isSameRunningChatToolRun, remainingChatToolProgressMs, type ChatToolRunKey } from "../utils/chatToolProgress";
import { makeId } from "../utils/ids";
import type { AgentStartTarget } from "./appContextTypes";
import type { LocalChatStore, ResolveChatTarget } from "./localChatActionTypes";
import { updateThreadMessage } from "./localChatMessageHelpers";

export function createLocalChatImageActions(store: LocalChatStore, resolveTarget: ResolveChatTarget) {
  const { setters } = store;
  function addLocalGeneratedImage(prompt: string, image: GeneratedImage, target?: AgentStartTarget) {
    const { projectId, file } = resolveTarget(target);
    setters.setChatThreads((current) => ({ ...current, [projectId]: [
      ...(current[projectId] ?? []),
      { id: makeId("chat-user"), role: "user", text: prompt, file },
      { id: makeId("chat-assistant"), role: "assistant", text: `Created **${image.title}**.`, file, generatedImage: image }
    ] }));
    setters.setTaskText("");
  }

  function addLocalImageGenerationPending(prompt: string, target?: AgentStartTarget) {
    const { projectId, file } = resolveTarget(target);
    const assistantId = makeId("chat-assistant");
    setters.setChatThreads((current) => ({ ...current, [projectId]: [
      ...(current[projectId] ?? []),
      { id: makeId("chat-user"), role: "user", text: prompt, file },
      { id: assistantId, role: "assistant", text: "Working on it...", file,
        runStatus: { route: "cloud", mode: "chat", status: "running", tool: "image", startedAt: Date.now() } }
    ] }));
    setters.setTaskText("");
    return assistantId;
  }

  function finishLocalGeneratedImage(
    messageId: string, image: GeneratedImage, target?: AgentStartTarget, expectedRun?: ChatToolRunKey | null
  ) {
    const { projectId } = resolveTarget(target);
    setters.setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => {
      if (!isSameRunningChatToolRun(message.runStatus, expectedRun ?? null)) return message;
      const delay = remainingChatToolProgressMs(message.runStatus);
      if (delay > 0) {
        const runKey = expectedRun ?? chatToolRunKey(message.runStatus);
        setTimeout(() => finishLocalGeneratedImage(messageId, image, target, runKey), delay);
        return message;
      }
      return { ...message, text: `Created **${image.title}**.`, generatedImage: image,
        runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus };
    }));
  }

  function failLocalImageGeneration(messageId: string, error: string, target?: AgentStartTarget) {
    const { projectId } = resolveTarget(target);
    setters.setChatThreads((current) => updateThreadMessage(current, projectId, messageId, (message) => ({
      ...message, text: error,
      runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
    })));
  }
  return { addLocalGeneratedImage, addLocalImageGenerationPending, finishLocalGeneratedImage, failLocalImageGeneration };
}
