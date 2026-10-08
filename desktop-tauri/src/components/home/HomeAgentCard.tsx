import { useEffect, useState } from "react";

import type { SharedSession } from "../../ipc/sharedChats";
import { agentIdentity } from "../../lib/agentIdentity";
import { agentRun, shortDuration, type AgentRun, type RunState } from "../../lib/agentRun";
import { openPane, waitingLine } from "../../lib/needsYou";
import { relativeTime } from "../../lib/relativeTime";
import { useAgentAttention } from "../../state/agentAttentionStore";
import { useAgentStore } from "../../state/agentStore";
import { useConversationTerminals } from "../../state/conversationTerminalStore";
import { useProjectStore } from "../../state/projectStore";
import { paneLabel, useTerminalStore } from "../../state/terminalStore";
import type { PaneState } from "../../state/terminalStoreTypes";
import { AgentLogo } from "../common/AgentLogo";
import { CheckIcon } from "../common/Icons";
import { useSharedChat } from "../sharedChats/useSharedChat";

const WORD: Record<RunState, string> = { working: "Working", waiting: "Needs you", done: "Done", failed: "Failed", stopped: "Stopped", ready: "Ready" };

function useNow(live: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return now;
}

/** How long it has been working, or when it finished. */
function when(run: AgentRun, now: number): string {
  if (run.state === "working") return run.startedAt ? shortDuration(now - run.startedAt) : "";
  if (run.state === "done" || run.state === "stopped" || run.state === "failed") return run.finishedAt ? relativeTime(run.finishedAt) : "";
  return "";
}

/** One agent as one quiet row: what it is on, then a single line of what it
 * is doing or found, its state on the right. Opens its chat. */
function AgentRow({ agentId, name, title, run, line, fresh = false, onOpen }: {
  fresh?: boolean; agentId: string; name: string; title: string; run: AgentRun; line?: string | null; onOpen: () => void;
}) {
  const live = run.state === "working";
  const now = useNow(live);
  const time = when(run, now);
  const detail = (live || run.state === "waiting") && run.step
    ? <><b>{run.step.title}</b>{run.step.command && <code>{run.step.command}</code>}</>
    : run.found ?? line ?? (run.state === "ready" ? "Ready for a task" : null);
  return <button type="button" className={`sb-agent sb-agent--${run.state}${fresh ? " sb-agent--fresh" : ""}`} onClick={onOpen}
    aria-label={`${name}: ${title}, ${WORD[run.state]}`}>
    <AgentLogo agentId={agentId} name={name} size={34} />
    <span className="sb-agent__body">
      <span className="sb-agent__ask">{title}</span>
      <span className="sb-agent__line"><span className="sb-agent__name">{name}</span>{detail && <span className="sb-agent__detail">{detail}</span>}</span>
    </span>
    <span className="sb-agent__side">
      <span className={`sb-agent__state sb-agent__state--${run.state}`}>
        {live || run.state === "waiting" ? <i className="sb-agent__pulse" /> : run.state === "done" ? <CheckIcon size={11} /> : null}{WORD[run.state]}
      </span>
      {time && <span className="sb-agent__meta">{time}</span>}
    </span>
  </button>;
}

export function ChatAgentCard({ session }: { session: SharedSession }) {
  const { snapshot } = useSharedChat(session.id, true);
  const catalogue = useAgentStore((s) => s.agents);
  const agentId = session.kind ?? snapshot?.settings?.provider ?? "";
  const agent = agentIdentity(agentId, catalogue);
  const run = agentRun(snapshot);
  // Finished since you last looked: a small dot until the chat is opened.
  const fresh = useAgentAttention((s) => { const at = s.runs[session.id]?.run.finishedAt; return Boolean(at && at > (s.seen[session.id] ?? Infinity)); });
  const open = async () => {
    await useProjectStore.getState().activate(session.projectId);
    useConversationTerminals.getState().reveal(session.id);
    useAgentAttention.getState().markSeen(session.id);
  };
  return <AgentRow agentId={agentId} name={agent.name} title={run.ask ?? (session.title || `${agent.name} chat`)} run={run} fresh={fresh} onOpen={() => void open()} />;
}

/** A classic terminal has no transcript: its state comes from activity and
 * its detail from the last line on screen. */
export function PaneAgentCard({ pane }: { pane: PaneState }) {
  const catalogue = useAgentStore((s) => s.agents);
  const activity = useTerminalStore((s) => s.activity[pane.id]);
  const agent = agentIdentity(pane.agentId, catalogue);
  const state: RunState = activity === "attention" ? "waiting" : activity === "working" ? "working" : "ready";
  const run: AgentRun = { state, ask: null, step: null, found: null, steps: 0, commands: 0, startedAt: pane.openedAt ?? null, finishedAt: null, durationMs: null };
  return <AgentRow agentId={pane.agentId} name={agent.name} title={paneLabel(pane)} run={run} line={waitingLine(pane.id)} onOpen={() => void openPane(pane)} />;
}
