import { ChatMessage } from "../types/domain";

export const MAX_CHAT_MESSAGES_PER_THREAD = 80;
export const MAX_DETACHED_CHAT_THREADS = 40;
const MAX_CHAT_TEXT_CHARS = 24000;
const TEXT_HEAD_CHARS = 16000;
const TEXT_TAIL_CHARS = 6000;

const STALE_BUSY_FRAGMENTS = [
  "already running",
  "still finishing the current run",
  "desktop ai worker is still cleaning up",
  "desktop ai worker is cleaning up"
];

export function isStaleBusyAssistantText(text: string): boolean {
  const lower = text.toLowerCase();
  return STALE_BUSY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

export function normalizeChatThreads(value: unknown): Record<string, ChatMessage[]> {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, ChatMessage[]>>((threads, [projectId, messages]) => {
    if (!Array.isArray(messages)) return threads;
    const normalized = messages
      .map((message): ChatMessage | null => {
        if (!message || typeof message !== "object") return null;
        const item = message as Partial<ChatMessage>;
        const id = String(item.id ?? "").trim();
        const role = item.role === "assistant" || item.role === "user" ? item.role : null;
        const text = trimChatText(String(item.text ?? "").trim());
        if (!id || !role || !text) return null;
        return {
          id,
          role,
          text,
          assistantModel: typeof item.assistantModel === "string" ? item.assistantModel : undefined,
          file: item.file ? String(item.file) : undefined
        };
      })
      .filter((message): message is ChatMessage => Boolean(message))
      .slice(-MAX_CHAT_MESSAGES_PER_THREAD);

    const swept = stripBusyFailures(normalized);
    if (swept.length > 0) threads[projectId] = swept;
    return threads;
  }, {});
}

export function limitChatMessagesForRuntime(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_CHAT_MESSAGES_PER_THREAD).map((message) => {
    const text = trimChatText(message.text);
    return text === message.text ? message : { ...message, text };
  });
}

export function limitChatThreadsForRuntime(threads: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
  let changed = false;
  const next = Object.entries(threads).reduce<Record<string, ChatMessage[]>>((limited, [threadId, messages]) => {
    const limitedMessages = limitChatMessagesForRuntime(messages);
    if (limitedMessages.length !== messages.length || limitedMessages.some((message, index) => message !== messages[messages.length - limitedMessages.length + index])) {
      changed = true;
    }
    if (limitedMessages.length > 0) limited[threadId] = limitedMessages;
    return limited;
  }, {});
  return changed || Object.keys(next).length !== Object.keys(threads).length ? next : threads;
}

export function limitDetachedChatRecords(
  threads: Record<string, ChatMessage[]>,
  titles: Record<string, string>,
  updatedAt: Record<string, number>
) {
  const keptIds = Object.entries(threads)
    .filter(([, messages]) => messages.length > 0)
    .sort(([a], [b]) => (updatedAt[b] ?? 0) - (updatedAt[a] ?? 0))
    .slice(0, MAX_DETACHED_CHAT_THREADS)
    .map(([chatId]) => chatId);
  const kept = new Set(keptIds);
  return {
    threads: keptIds.reduce<Record<string, ChatMessage[]>>((next, chatId) => {
      next[chatId] = threads[chatId];
      return next;
    }, {}),
    titles: Object.entries(titles).reduce<Record<string, string>>((next, [chatId, title]) => {
      if (kept.has(chatId)) next[chatId] = title;
      return next;
    }, {}),
    updatedAt: Object.entries(updatedAt).reduce<Record<string, number>>((next, [chatId, timestamp]) => {
      if (kept.has(chatId)) next[chatId] = timestamp;
      return next;
    }, {})
  };
}

function trimChatText(text: string) {
  if (text.length <= MAX_CHAT_TEXT_CHARS) return text;
  return `${text.slice(0, TEXT_HEAD_CHARS)}\n\n[Middle of this long message trimmed for app performance.]\n\n${text.slice(-TEXT_TAIL_CHARS)}`;
}

function stripBusyFailures(messages: ChatMessage[]): ChatMessage[] {
  const drop = new Set<number>();
  messages.forEach((message, index) => {
    if (message.role !== "assistant") return;
    if (!isStaleBusyAssistantText(message.text)) return;
    drop.add(index);
    const prior = messages[index - 1];
    if (prior && prior.role === "user") drop.add(index - 1);
  });
  if (drop.size === 0) return messages;
  return messages.filter((_, index) => !drop.has(index));
}

export function normalizeChatTitles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((titles, [projectId, title]) => {
    const normalized = String(title ?? "").trim();
    if (normalized) titles[projectId] = normalized.slice(0, 80);
    return titles;
  }, {});
}
