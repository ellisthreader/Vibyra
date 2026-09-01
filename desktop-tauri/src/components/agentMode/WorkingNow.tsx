import { useEffect, useState } from "react";

import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";

/**
 * What the team is doing, as a list you can steer from.
 *
 * This was the sentence "3 chats in progress" — a count with no agent, no
 * title, no elapsed time and nothing to click, on the one screen that exists
 * to answer *what is my team doing*.
 *
 * The elapsed clock ticks once every ten seconds, not every second. This sits
 * beside live terminals and a re-render a second across a running grid is
 * exactly the kind of ambient cost the dashboard's own rule refuses; at this
 * scale nobody is reading the seconds anyway.
 */
function since(startedMs: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - startedMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function WorkingNow() {
  const chats = useAgentChatStore((state) => state.chats);
  const running = useAgentChatStore((state) => state.running);
  const startedMs = useAgentChatStore((state) => state.startedMs);
  const openChat = useAgentChatStore((state) => state.openChat);
  const agents = useAgentRosterStore((state) => state.agents);
  const mode = useAgentModeStore();
  const [now, setNow] = useState(() => Date.now());

  const live = Object.entries(chats).flatMap(([owner, list]) =>
    list
      .filter((chat) => running[chat.id])
      .map((chat) => ({
        chat,
        who: agents.find((agent) => agent.id === owner)?.name ?? "Detached",
      })),
  );

  useEffect(() => {
    if (live.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [live.length]);

  if (live.length === 0) {
    return <p className="dashboard__quiet">Nothing is running.</p>;
  }

  return (
    <ul className="working">
      {live.map(({ chat, who }) => (
        <li key={chat.id}>
          <button
            type="button"
            className="working__row"
            onClick={() => {
              mode.setMode(chat.agentId ? "agent" : "chat");
              if (chat.agentId) mode.selectAgent(chat.agentId);
              mode.selectChat(chat.id);
              void openChat(chat.id);
            }}
          >
            <span className="working__pulse" aria-hidden="true" />
            <span className="working__who">{who}</span>
            <span className="working__what">{chat.title || "New chat"}</span>
            <span className="working__since">
              {startedMs[chat.id] ? since(startedMs[chat.id], now) : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
