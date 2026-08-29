import { useEffect, useState } from "react";

import type { AgentProfile } from "../../agentTypes";
import { PinIcon, TrashIcon } from "../common/AgentIcons";
import { PlusIcon, SearchIcon } from "../common/Icons";
import { relativeTime } from "../../lib/relativeTime";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";

/**
 * One agent's chats.
 *
 * New Chat is the first thing in the list, not a menu item, because it is the
 * gesture the product wants people to reach for: a materially different goal
 * belongs in its own chat, and starting one costs nothing — no other chat is
 * touched, and all of them keep the same brief, memory, skills and grants.
 */
export function AgentChatRail({ agent }: { agent: AgentProfile }) {
  const chats = useAgentChatStore((state) => state.chats[agent.id] ?? []);
  const running = useAgentChatStore((state) => state.running);
  const newChat = useAgentChatStore((state) => state.newChat);
  const amend = useAgentChatStore((state) => state.amend);
  const remove = useAgentChatStore((state) => state.remove);
  const openChat = useAgentChatStore((state) => state.openChat);
  const chatId = useAgentModeStore((state) => state.chatId);
  const selectChat = useAgentModeStore((state) => state.selectChat);
  const [query, setQuery] = useState("");

  // Open the most recent chat rather than an empty surface: a teammate you
  // have talked to before should show that conversation, not a blank page.
  useEffect(() => {
    if (chatId || chats.length === 0) return;
    selectChat(chats[0].id);
    void openChat(chats[0].id);
  }, [chatId, chats, openChat, selectChat]);

  const shown = query.trim()
    ? chats.filter((chat) => chat.title.toLowerCase().includes(query.trim().toLowerCase()))
    : chats;

  const start = async () => {
    const chat = await newChat(agent.id, agent.engine);
    if (chat) selectChat(chat.id);
  };

  return (
    <aside className="chat-rail">
      <div className="chat-rail__head">
        <button className="chat-rail__new" onClick={start}>
          <PlusIcon size={13} /> New chat
        </button>
        <label className="chat-rail__search">
          <SearchIcon size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search this agent's chats"
          />
        </label>
      </div>
      <ul className="chat-rail__list">
        {shown.map((chat) => (
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
                {running[chat.id] ? (
                  <span className="activity-dot" title="Working" />
                ) : (
                  relativeTime(chat.updatedMs)
                )}
              </span>
              {chat.source === "routine" && <span className="chat-row__tag">Routine</span>}
              {chat.source === "handoff" && <span className="chat-row__tag">Handoff</span>}
            </button>
            <div className="chat-row__actions">
              <button
                className="icon-btn"
                title={chat.pinned ? "Unpin" : "Pin"}
                onClick={() => void amend(chat.id, agent.id, { pinned: !chat.pinned })}
              >
                <PinIcon size={12} />
              </button>
              <button
                className="icon-btn"
                title="Delete this chat"
                onClick={() => void remove(chat.id, agent.id)}
              >
                <TrashIcon size={12} />
              </button>
            </div>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="chat-rail__empty">
            {query ? "No chat matches that." : "No chats yet."}
          </li>
        )}
      </ul>
    </aside>
  );
}
