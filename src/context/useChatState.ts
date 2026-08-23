import { Dispatch, SetStateAction, useCallback, useState } from "react";
import type { ChatMessage } from "../types/domain";
import { limitChatThreadsForRuntime } from "../utils/chatThreads";
import type { PersistedSession } from "../utils/persistence";
import { emptyChatMessages } from "./appStateDefaults";
import type { getPersistedAppState } from "./appStatePersistence";

type Threads = Record<string, ChatMessage[]>;

export function useChatState(_session: PersistedSession, app: ReturnType<typeof getPersistedAppState>, selectedProjectId: string) {
  const [taskText, setTaskText] = useState("");
  const [chatThreads, setChatThreadsState] = useState<Threads>(app.chatThreads);
  const [chatTitles, setChatTitles] = useState<Record<string, string>>(app.chatTitles);
  const [detachedChatThreads, setDetachedChatThreadsState] = useState<Threads>(app.detachedChatThreads);
  const [detachedChatTitles, setDetachedChatTitles] = useState<Record<string, string>>(app.detachedChatTitles);
  const [detachedChatUpdatedAt, setDetachedChatUpdatedAt] = useState<Record<string, number>>(app.detachedChatUpdatedAt);
  const [chatSkills, setChatSkills] = useState<import("../utils/appApi").ChatSkill[]>([]);
  const [chatProjects, setChatProjects] = useState<Record<string, import("../types/domain").Project>>(app.chatProjects);
  const [projectMemories, setProjectMemories] = useState<Record<string, import("../types/domain").ProjectMemory>>(app.projectMemories);
  const [editApprovals, setEditApprovals] = useState<Record<string, "always">>(app.editApprovals);
  const [promptMoney, setPromptMoney] = useState(app.promptMoney);

  const setChatThreads = useCallback<Dispatch<SetStateAction<Threads>>>((update) => {
    setChatThreadsState((current) => limitChatThreadsForRuntime(
      typeof update === "function" ? update(current) : update
    ));
  }, []);
  const setDetachedChatThreads = useCallback<Dispatch<SetStateAction<Threads>>>((update) => {
    setDetachedChatThreadsState((current) => limitChatThreadsForRuntime(
      typeof update === "function" ? update(current) : update
    ));
  }, []);
  const setChatMessages = useCallback<Dispatch<SetStateAction<ChatMessage[]>>>((update) => {
    setChatThreads((current) => {
      const previous = current[selectedProjectId] ?? emptyChatMessages;
      const next = typeof update === "function" ? update(previous) : update;
      return { ...current, [selectedProjectId]: next };
    });
  }, [selectedProjectId, setChatThreads]);

  return {
    state: { taskText, chatMessages: chatThreads[selectedProjectId] ?? emptyChatMessages, chatThreads, chatTitles,
      detachedChatThreads, detachedChatTitles, detachedChatUpdatedAt, chatSkills, chatProjects, projectMemories,
      editApprovals, promptMoney },
    setters: { setTaskText, setChatMessages, setChatThreads, setChatTitles, setDetachedChatThreads,
      setDetachedChatTitles, setDetachedChatUpdatedAt, setChatSkills, setChatProjects, setProjectMemories,
      setEditApprovals, setPromptMoney },
    hydration: { setChatThreadsState, setDetachedChatThreadsState }
  };
}
