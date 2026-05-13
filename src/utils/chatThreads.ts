import { ChatMessage } from "../types/domain";

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

    if (normalized.length > 0) threads[projectId] = normalized;
    return threads;
  }, {});
}

export function normalizeChatTitles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((titles, [projectId, title]) => {
    const normalized = String(title ?? "").trim();
    if (normalized) titles[projectId] = normalized.slice(0, 80);
    return titles;
  }, {});
}
