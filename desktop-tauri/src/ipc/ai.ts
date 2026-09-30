import { Channel, invoke } from "@tauri-apps/api/core";

import type { AiServiceStatus } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** One batch of reply text, 16 ms of it at a time. */
export interface ChatDelta {
  text: string;
}

/** One action the model asked Vibyra to take. `arguments` is its raw JSON. */
export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatOutcome {
  /** The whole trimmed reply, authoritative over the deltas that preceded it. */
  text: string;
  /** True when Stop ended it: a short reply, not a failed one. */
  stopped: boolean;
  /** What it wants done. Empty for an ordinary answer. */
  toolCalls: ChatToolCall[];
}

/** Streams one reply. Completion, failure and token usage deliberately do not
 * travel on the channel — this promise is the authority, which is what removes
 * the race between the last delta and the reply settling. Rejects with the
 * sentence the person should read. */
export function aiChat(
  requestId: string,
  messages: ChatMessage[],
  onEvent: (delta: ChatDelta) => void,
  tools?: Record<string, unknown>[],
): Promise<ChatOutcome> {
  const channel = new Channel<ChatDelta>();
  channel.onmessage = onEvent;
  return invoke("ai_chat", { requestId, messages, tools: tools ?? null, onEvent: channel });
}

/** Always resolves: stopping a reply that just finished is not an error, and
 * the id keeps a late Stop off the retry that replaced it. */
export function aiChatStop(requestId: string): Promise<void> {
  return invoke("ai_chat_stop", { requestId });
}

export function aiServiceStatus(): Promise<AiServiceStatus> {
  return invoke("ai_service_status");
}

// `set_openai_key`, `clear_openai_key` and `open_openai_key_page` are
// deliberately not wrapped: the credential is the deployment's, and the
// renderer has no page from which to change it. The native commands stay
// registered for whoever owns the install.
