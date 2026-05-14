import { ChatMessage } from "../types/domain";

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
        const text = String(item.text ?? "").trim();
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
      .slice(-80);

    const swept = stripBusyFailures(normalized);
    if (swept.length > 0) threads[projectId] = swept;
    return threads;
  }, {});
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
