import { useEffect } from "react";

import { NONE } from "../../lib/emptyList";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { ChatModeRail } from "./ChatModeRail";
import { ChatSurface } from "./ChatSurface";

/**
 * Chat Mode: a conversation with no teammate and no project.
 *
 * The same table, the same runtime and the same transcript as an agent chat —
 * what differs is authority. No brief, no memory, no skills, and no folder at
 * all unless the user mounts one, at which point the composer stops claiming
 * to be detached.
 */
export function ChatMode() {
  const loadChats = useAgentChatStore((state) => state.loadChats);
  const openChat = useAgentChatStore((state) => state.openChat);
  const chats = useAgentChatStore((state) => state.chats.detached ?? NONE);
  const chatId = useAgentModeStore((state) => state.chatId);
  const selectChat = useAgentModeStore((state) => state.selectChat);

  useEffect(() => {
    void loadChats(null);
  }, [loadChats]);

  useEffect(() => {
    if (chatId || chats.length === 0) return;
    selectChat(chats[0].id);
    void openChat(chats[0].id);
  }, [chatId, chats, openChat, selectChat]);

  return (
    <>
      <ChatModeRail />
      <main className="agent-main">
        <ChatSurface agent={null} />
      </main>
    </>
  );
}
