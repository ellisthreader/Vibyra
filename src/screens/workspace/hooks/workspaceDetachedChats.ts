import { useCallback } from "react";
import { ChatMessage } from "../../../types/domain";
import { makeId } from "../../../utils/ids";
import type { WorkspaceState } from "./useWorkspaceState";

export function isDetachedChatId(chatId: string | null | undefined) {
  return Boolean(chatId?.startsWith("detached-"));
}

export function detachedChatTitle(prompt: string) {
  const title = prompt.trim().replace(/\s+/g, " ");
  if (!title) return "New chat";
  return title.length > 64 ? `${title.slice(0, 61)}...` : title;
}

export function useWorkspaceDetachedChats(s: WorkspaceState) {
  const { app } = s;

  const ensureDetachedChat = useCallback((prompt: string) => {
    const existingId = isDetachedChatId(s.selectedChatId) ? s.selectedChatId! : "";
    const chatId = existingId || makeId("detached-chat");
    const now = Date.now();

    if (!existingId) {
      s.setSelectedChatId(chatId);
      s.setNewChatMessages([]);
    }

    app.setDetachedChatTitles((current) => (
      current[chatId] ? current : { ...current, [chatId]: detachedChatTitle(prompt) }
    ));
    app.setDetachedChatUpdatedAt((current) => ({ ...current, [chatId]: now }));
    return chatId;
  }, [app, s]);

  const appendDetachedMessages = useCallback((prompt: string, messages: ChatMessage[]) => {
    const chatId = ensureDetachedChat(prompt);
    app.setDetachedChatThreads((current) => {
      const existing = current[chatId] ?? [];
      return { ...current, [chatId]: [...existing, ...messages] };
    });
    app.setDetachedChatUpdatedAt((current) => ({ ...current, [chatId]: Date.now() }));
    return chatId;
  }, [app, ensureDetachedChat]);

  const updateDetachedMessage = useCallback((chatId: string, messageId: string, update: (message: ChatMessage) => ChatMessage) => {
    app.setDetachedChatThreads((current) => ({
      ...current,
      [chatId]: (current[chatId] ?? []).map((message) => message.id === messageId ? update(message) : message)
    }));
    app.setDetachedChatUpdatedAt((current) => ({ ...current, [chatId]: Date.now() }));
  }, [app]);

  return { appendDetachedMessages, ensureDetachedChat, updateDetachedMessage };
}
