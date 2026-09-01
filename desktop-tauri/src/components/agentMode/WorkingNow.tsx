import { useEffect, useState } from "react";

import { NONE } from "../../lib/emptyList";
import { isParked } from "../../lib/routineRunStrip.ts";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";

/**
 * What the team is doing, as a list you can steer from.
 *
 * This was the sentence "3 chats in progress" — a count with no agent, no
 * title, no elapsed time and nothing to click, on the one screen that exists
 * to answer *what is my team doing*.
 *
 * Both kinds of work appear, because both are the team working: a routine
 * running on the scheduler's thread, and a chat you started that is still
 * going. A routine is listed by its own name rather than its chat's, because
 * the name is the thing you scheduled.
 *
 * Parked is called out separately and never as failure. A turn stopped at a
 * decision has done nothing wrong; it is waiting on the reader, and saying so
 * on this screen is what turns "why is nothing happening" into one click.
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

interface Live {
  key: string;
  who: string;
  what: string;
  parked: boolean;
  startedMs: number | null;
  chatId: string | null;
  agentId: string | null;
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

  const named = (id: string | null) =>
    agents.find((agent) => agent.id === id)?.name ?? "Detached";

  const live: Live[] = [];
  const seen = new Set<string>();

  for (const routine of routines) {
    const run = (runs[routine.id] ?? NONE)[0];
    if (!run || run.status !== "running") continue;
    if (run.chatId) seen.add(run.chatId);
    live.push({
      key: run.id,
      who: named(routine.agentId),
      what: routine.name,
      parked: isParked(run, waitingChats),
      startedMs: run.startedMs,
      chatId: run.chatId,
      agentId: routine.agentId,
    });
  }

  for (const [owner, list] of Object.entries(chats)) {
    for (const chat of list) {
      if (!running[chat.id] || seen.has(chat.id)) continue;
      live.push({
        key: chat.id,
        who: named(owner === "detached" ? null : owner),
        what: chat.title || "New chat",
        parked: waitingChats.includes(chat.id),
        startedMs: startedMs[chat.id] ?? null,
        chatId: chat.id,
        agentId: chat.agentId,
      });
    }
  }

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
      {live.map((entry) => (
        <li key={entry.key}>
          <button
            type="button"
            className={`working__row ${entry.parked ? "is-parked" : ""}`}
            disabled={!entry.chatId}
            onClick={() => {
              if (!entry.chatId) return;
              mode.setMode("agent");
              if (entry.agentId) mode.selectAgent(entry.agentId);
              mode.selectChat(entry.chatId);
              void openChat(entry.chatId);
            }}
          >
            <span className="working__pulse" aria-hidden="true" />
            <span className="working__who">{entry.who}</span>
            <span className="working__what">
              {entry.what}
              {entry.parked && " — waiting on a decision"}
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
