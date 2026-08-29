import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  AgentChat,
  ChatAttachment,
  ChatEventRow,
  ChatSource,
  Engine,
  PermissionMode,
} from "../agentTypes";

// Chats and turns. `sendTurn` mirrors `createTerminal`: a channel per call,
// native-side batching, and no polling — the transcript on screen is written
// from the same loop as the transcript in the database.

export function listChats(agentId: string | null): Promise<AgentChat[]> {
  return invoke("agent_chat_list", { agentId });
}

export function createChat(request: {
  agentId: string | null;
  engine: Engine;
  title?: string;
  source?: ChatSource;
}): Promise<AgentChat> {
  return invoke("agent_chat_create", {
    request: {
      agentId: request.agentId,
      engine: request.engine,
      title: request.title ?? "",
      source: request.source ?? "user",
    },
  });
}

/** The most recent page, or the page before `beforeSeq`. */
export function chatEvents(chatId: string, beforeSeq?: number): Promise<ChatEventRow[]> {
  return invoke("agent_chat_events", { chatId, beforeSeq: beforeSeq ?? null });
}

export function amendChat(
  chatId: string,
  change: { title?: string; pinned?: boolean; archived?: boolean },
): Promise<AgentChat> {
  return invoke("agent_chat_amend", {
    chatId,
    title: change.title ?? null,
    pinned: change.pinned ?? null,
    archived: change.archived ?? null,
  });
}

/** Gives a detached chat one folder, or takes it away with `null`. */
export function mountChatPlace(chatId: string, path: string | null): Promise<void> {
  return invoke("agent_chat_mount", { chatId, path });
}

export function deleteChat(chatId: string): Promise<void> {
  return invoke("agent_chat_delete", { chatId });
}

export function searchChats(query: string): Promise<AgentChat[]> {
  return invoke("agent_chat_search", { query });
}

export function attachToChat(chatId: string, path: string): Promise<ChatAttachment> {
  return invoke("agent_chat_attach", { chatId, path });
}

/** Runs a turn, calling `onEvent` for each normalized event as it arrives. */
export function sendTurn(
  options: {
    chatId: string;
    prompt: string;
    permission?: PermissionMode | null;
    accountId?: string | null;
  },
  onEvent: (row: ChatEventRow) => void,
): Promise<void> {
  const channel = new Channel<ChatEventRow>();
  channel.onmessage = onEvent;
  return invoke("agent_turn_send", {
    chatId: options.chatId,
    prompt: options.prompt,
    permission: options.permission ?? null,
    accountId: options.accountId ?? null,
    onEvent: channel,
  });
}

/** Stops a turn. The chat and its conversation survive; only this turn ends. */
export function cancelTurn(chatId: string): Promise<boolean> {
  return invoke("agent_turn_cancel", { chatId });
}

/** Which chats are working. Read after a reload, which lost its channels. */
export function runningChats(): Promise<string[]> {
  return invoke("agent_turn_running");
}
