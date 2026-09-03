import { useEffect, useState } from "react";

import { isParked } from "../../lib/routineRunStrip.ts";
import { liveWork, type Live } from "../../lib/agentLiveWork.ts";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { EmptyState } from "./EmptyState";
import { TerminalIcon } from "../common/AgentIcons";

/**
 * What the team is doing, as a list you can steer from.
 *
 * This was the sentence "3 chats in progress" — a count with no agent, no
 * title, no elapsed time and nothing to click, on the one screen that exists
 * to answer *what is my team doing*.
 *
 * Parked is called out separately and never as failure. A turn stopped at a
 * decision has done nothing wrong; it is waiting on the reader, and saying so
 * here is what turns "why is nothing happening" into one click.
 *
 * The elapsed clock ticks once every ten seconds, not every second. This sits
 * beside live terminals and a re-render a second across a running grid is
 * exactly the ambient cost the dashboard's own rule refuses; nobody is reading
 * the seconds at this scale anyway.
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
  const routines = useAgentWorkStore((state) => state.routines);
  const runs = useAgentWorkStore((state) => state.runs);
  const waitingChats = useAgentWorkStore((state) => state.approvalChatIds);
  const agents = useAgentRosterStore((state) => state.agents);
  const mode = useAgentModeStore();
  const [now, setNow] = useState(() => Date.now());

  const live = liveWork({
    chats,
    running,
    startedMs,
    routines,
    runs,
    waitingChats,
    agents,
    isParked,
  });

  useEffect(() => {
    if (live.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [live.length]);

  if (live.length === 0) {
    return (
      <EmptyState
        compact
        icon={<TerminalIcon size={16} />}
        title="Nothing is running"
        body="A turn you send, a routine that fires, or a handoff from another teammate will show here."
      />
    );
  }

  const open = (entry: Live) => {
    if (!entry.chatId) return;
    mode.setMode("agent");
    if (entry.agentId) mode.selectAgent(entry.agentId);
    mode.selectChat(entry.chatId);
    void openChat(entry.chatId);
  };

  return (
    <ul className="rows">
      {live.map((entry) => (
        <li key={entry.key}>
          <button
            type="button"
            className={`row working__row ${entry.parked ? "is-parked" : ""}`}
            disabled={!entry.chatId}
            onClick={() => open(entry)}
          >
            <span className="working__pulse" aria-hidden="true" />
            <span className="row__text">
              <span className="row__title">
                <span>{entry.what}</span>
              </span>
              <span className="row__meta">
                {entry.who}
                {entry.parked && " — waiting on a decision"}
              </span>
            </span>
            <span className="working__since">
              {entry.startedMs ? since(entry.startedMs, now) : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
