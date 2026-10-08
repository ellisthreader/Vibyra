import { useEffect } from "react";

import { chatRequest, type ConversationSnapshot } from "../ipc/sharedChats";
import { useAgentAttention } from "../state/agentAttentionStore";
import { useConversationTerminals } from "../state/conversationTerminalStore";
import { useProjectStore } from "../state/projectStore";
import { agentRun } from "./agentRun";
import { splitConversationRows } from "./conversationCards";

const POLL_MS = 5000;

/** One app-wide poll of every live agent chat. A chat is re-read only when its
 * event cursor moved, so a quiet chat costs one small request per poll. Chats
 * in the project on screen count as seen. */
export function useAgentAttentionPoll(): void {
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const cursors = new Map<string, { cursor: number; generation: string }>();
    const tick = async () => {
      const { sessions, open } = useConversationTerminals.getState();
      const live = splitConversationRows(sessions, open).live;
      useAgentAttention.getState().keep(live.map((session) => session.id));
      for (const session of live) {
        if (!alive) return;
        try {
          const known = cursors.get(session.id);
          if (known && useAgentAttention.getState().runs[session.id]) {
            const version = await chatRequest<{ cursor: number; generation: string }>("conversation.events", { sessionId: session.id, afterCursor: known.cursor });
            if (version.cursor === known.cursor && version.generation === known.generation) continue;
          }
          const snapshot = await chatRequest<ConversationSnapshot>("conversation.snapshot", { sessionId: session.id });
          cursors.set(session.id, { cursor: snapshot.cursor, generation: snapshot.generation });
          useAgentAttention.getState().setRun(session.id, {
            projectId: session.projectId, agentId: session.kind ?? snapshot.settings?.provider ?? "", title: session.title, run: agentRun(snapshot),
          });
        } catch { /* An unreachable chat keeps its last known state. */ }
      }
      const { view, activeId } = useProjectStore.getState();
      if (view === "project" && activeId && document.visibilityState === "visible") {
        for (const session of live) if (session.projectId === activeId) useAgentAttention.getState().markSeen(session.id);
      }
      if (alive) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);
}
