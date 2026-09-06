import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";

/** Events provide prompt updates; replay also repairs a lost IPC channel. */
export function useAgentRecovery(): void {
  useEffect(() => {
    let stopped = false;
    let refreshing = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (stopped) return;
      if (refreshing) { dirty = true; return; }
      refreshing = true;
      const store = useAgentChatStore.getState();
      const { chatId, agentId, mode } = useAgentModeStore.getState();
      await Promise.all([store.adoptRunning(), store.loadChats(mode === "chat" ? null : agentId), chatId ? store.openChat(chatId) : Promise.resolve()]);
      refreshing = false;
      if (dirty) { dirty = false; schedule(); }
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(() => { timer = undefined; void refresh(); }, 150);
    };
    const listener = listen("agent-task-changed", schedule);
    const interval = setInterval(() => void refresh(), 3_000);
    void refresh();
    return () => {
      stopped = true; clearInterval(interval); clearTimeout(timer);
      void listener.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);
}
