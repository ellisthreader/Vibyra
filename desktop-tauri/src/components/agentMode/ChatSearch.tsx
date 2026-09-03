import { useEffect, useState } from "react";

import type { AgentChat } from "../../agentTypes";
import { searchChats } from "../../ipc/agentChats";
import { relativeTime } from "../../lib/relativeTime";
import { SearchIcon } from "../common/Icons";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";

/**
 * Search across every chat on the account, by title or by anything said.
 *
 * Searches what was actually said rather than only titles, because a chat
 * nobody renamed is the common case and its title is the first line of the
 * first prompt — which is rarely what you remember about it a week later.
 */
export function ChatSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AgentChat[]>([]);
  const agents = useAgentRosterStore((state) => state.agents);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const selectChat = useAgentModeStore((state) => state.selectChat);
  const openChat = useAgentChatStore((state) => state.openChat);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setHits([]);
      return;
    }
    // Debounced: the query walks the event payloads, and one per keystroke
    // would run it five times to answer the fifth.
    const timer = window.setTimeout(() => {
      void searchChats(term).then(setHits).catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const owner = (chat: AgentChat) =>
    agents.find((agent) => agent.id === chat.agentId)?.name ?? "Detached";

  return (
    <div className="chat-search">
      <label className="chat-rail__search">
        <SearchIcon size={13} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search every chat"
          aria-label="Search every chat on this account"
        />
      </label>
      {hits.length > 0 && (
        <ul className="chat-search__hits">
          {hits.map((chat) => (
            <li key={chat.id}>
              <button
                onClick={() => {
                  selectAgent(chat.agentId);
                  selectChat(chat.id);
                  void openChat(chat.id);
                  setQuery("");
                }}
              >
                <span>{chat.title || "New chat"}</span>
                <span>
                  {owner(chat)} · {relativeTime(chat.updatedMs)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 3 && hits.length === 0 && (
        <p className="chat-search__none">No chat mentions that.</p>
      )}
    </div>
  );
}
