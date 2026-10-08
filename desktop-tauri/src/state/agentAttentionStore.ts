import { create } from "zustand";

import type { AgentRun } from "../lib/agentRun";

// What every live agent chat is doing, across all projects, so Home, the
// sidebar and Needs you can say which projects need the person. Written by
// lib/useAgentAttention (one poll for the whole app).

export interface ChatRun { projectId: string; agentId: string; title: string; run: AgentRun }

export interface ChatNeed {
  sessionId: string;
  projectId: string;
  agentId: string;
  title: string;
  kind: "approval" | "finished";
  /** Identifies this one request, so clearing it never hides the next. */
  key: string;
  at: number | null;
  detail: string | null;
}

interface AgentAttention {
  runs: Record<string, ChatRun>;
  /** Per chat, the finish time the person has already seen. A chat first met
   * already finished counts as seen: only news from this run is flagged. */
  seen: Record<string, number>;
  /** Approvals cleared from Needs you, by chat: the key of the request cleared. */
  dismissed: Record<string, string>;
  setRun(id: string, entry: ChatRun): void;
  keep(ids: string[]): void;
  markSeen(id: string): void;
  /** Clear one from Needs you: a finish counts as seen, an approval is hidden
   * until that chat asks something new. */
  dismiss(need: ChatNeed): void;
}

export const useAgentAttention = create<AgentAttention>((set) => ({
  runs: {},
  seen: {},
  dismissed: {},
  setRun: (id, entry) => set((s) => ({
    runs: { ...s.runs, [id]: entry },
    seen: id in s.seen ? s.seen : { ...s.seen, [id]: entry.run.finishedAt ?? 0 },
  })),
  keep: (ids) => set((s) => {
    const gone = Object.keys(s.runs).filter((id) => !ids.includes(id));
    if (!gone.length) return s;
    const runs = { ...s.runs };
    for (const id of gone) delete runs[id];
    return { runs };
  }),
  markSeen: (id) => set((s) => {
    const finished = s.runs[id]?.run.finishedAt ?? 0;
    return (s.seen[id] ?? 0) >= finished ? s : { seen: { ...s.seen, [id]: Date.now() } };
  }),
  dismiss: (need) => set((s) => (need.kind === "finished"
    ? { seen: { ...s.seen, [need.sessionId]: Date.now() } }
    : { dismissed: { ...s.dismissed, [need.sessionId]: need.key } })),
}));

/** Chats waiting on the person: an approval, or a finish not yet looked at. */
export function chatNeeds(runs: Record<string, ChatRun>, seen: Record<string, number>, dismissed: Record<string, string> = {}): ChatNeed[] {
  const out: ChatNeed[] = [];
  for (const [sessionId, { projectId, agentId, title, run }] of Object.entries(runs)) {
    const base = { sessionId, projectId, agentId, title: run.ask ?? title };
    const key = `${run.state}:${run.startedAt ?? 0}:${run.step?.title ?? ""}`;
    if (run.state === "waiting") { if (dismissed[sessionId] !== key) out.push({ ...base, kind: "approval", key, at: null, detail: run.step?.title ?? null }); }
    else if ((run.state === "done" || run.state === "failed" || run.state === "stopped") && run.finishedAt && run.finishedAt > (seen[sessionId] ?? 0)) {
      out.push({ ...base, kind: "finished", key, at: run.finishedAt, detail: run.found });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? (b.at ?? 0) - (a.at ?? 0) : a.kind === "approval" ? -1 : 1));
}
