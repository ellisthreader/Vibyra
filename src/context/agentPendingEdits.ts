import type { ChatMessage } from "../types/domain";
import { makeId } from "../utils/ids";

type SetChatThreads = (
  update: (current: Record<string, ChatMessage[]>) => Record<string, ChatMessage[]>
) => void;

export function appendPendingEditReminder(
  setChatThreads: SetChatThreads,
  setTaskText: (value: string) => void,
  projectId: string,
  prompt: string,
  file?: string
) {
  setChatThreads((current) => ({
    ...current,
    [projectId]: [
      ...(current[projectId] ?? []),
      { id: makeId("chat-user"), role: "user", text: prompt, file },
      {
        id: makeId("chat-assistant"),
        role: "assistant",
        text: "There are generated edits waiting for your approval. Review the pending code changes card, then choose Allow, Allow always, or No before I start another run.",
        file
      }
    ]
  }));
  setTaskText("");
}
