import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { relativeTime } from "../../lib/relativeTime";
import { mountChatPlace } from "../../ipc/agentChats";
import { TrashIcon } from "../common/AgentIcons";
import { FolderIcon, PlusIcon } from "../common/Icons";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";

/**
 * Chat Mode's list, plus the one control that changes what a chat can reach.
 *
 * Mounting a folder is here rather than in the composer because it is a
 * property of the conversation, not of a turn — and because it should take a
 * deliberate trip to the side of the screen rather than sitting next to Send.
 */
export function ChatModeRail() {
  const chats = useAgentChatStore((state) => state.chats.detached ?? []);
  const running = useAgentChatStore((state) => state.running);
  const newChat = useAgentChatStore((state) => state.newChat);
  const remove = useAgentChatStore((state) => state.remove);
  const openChat = useAgentChatStore((state) => state.openChat);
  const loadChats = useAgentChatStore((state) => state.loadChats);
  const chatId = useAgentModeStore((state) => state.chatId);
  const selectChat = useAgentModeStore((state) => state.selectChat);

  const start = async () => {
    const chat = await newChat(null, "claude");
    if (chat) selectChat(chat.id);
  };

  const mount = async (id: string, current: string | null) => {
    if (current) {
      await mountChatPlace(id, null).catch(() => {});
      await loadChats(null);
      return;
    }
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Give this chat one folder to read",
    }).catch(() => null);
    if (typeof picked === "string" && picked) {
      await mountChatPlace(id, picked).catch(() => {});
      await loadChats(null);
    }
  };

  return (
    <aside className="rail chat-rail">
      <div className="chat-rail__head">
        <button className="chat-rail__new" onClick={start}>
          <PlusIcon size={13} /> New chat
        </button>
      </div>
      <ul className="chat-rail__list">
        {chats.map((chat) => (
          <li key={chat.id}>
            <button
              className={`chat-row ${chat.id === chatId ? "is-on" : ""}`}
              aria-current={chat.id === chatId}
              onClick={() => {
                selectChat(chat.id);
                void openChat(chat.id);
              }}
            >
              <span className="chat-row__title">{chat.title || "New chat"}</span>
              <span className="chat-row__meta">
                {running[chat.id] ? <span className="activity-dot" /> : relativeTime(chat.updatedMs)}
              </span>
              {chat.mountedPlace && (
                <span className="chat-row__tag" title={chat.mountedPlace}>
                  mounted
                </span>
              )}
            </button>
            <div className="chat-row__actions">
              <button
                className="icon-btn"
                title={chat.mountedPlace ? "Detach this chat again" : "Give it a folder"}
                onClick={() => void mount(chat.id, chat.mountedPlace)}
              >
                <FolderIcon size={12} />
              </button>
              <button className="icon-btn" title="Delete" onClick={() => void remove(chat.id, null)}>
                <TrashIcon size={12} />
              </button>
            </div>
          </li>
        ))}
        {chats.length === 0 && <li className="chat-rail__empty">No chats yet.</li>}
      </ul>
    </aside>
  );
}
