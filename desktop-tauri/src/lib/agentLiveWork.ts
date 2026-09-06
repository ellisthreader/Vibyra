import type { AgentRun } from "../agentRunTypes";
import type { AgentChat, AgentProfile } from "../agentTypes";
import type { Routine, RoutineRun } from "../agentWorkTypes";

// Merging the two kinds of live work into one list.
//
// Both are the team working: a routine running on the scheduler's thread, and
// a chat you started that is still going. A routine is listed by its own name
// rather than its chat's, because the name is the thing you scheduled — and
// its chat is then skipped, so one piece of work is never two rows.
//
// Extracted from the component so the merge can be read (and tested) without a
// renderer: the de-duplication between a routine and the chat it opened is the
// part that was quietly wrong before it had a name.

export interface Live {
  key: string;
  who: string;
  what: string;
  parked: boolean;
  startedMs: number | null;
  chatId: string | null;
  agentId: string | null;
}

export interface LiveWorkInput {
  tasks?: AgentRun[];
  chats: Record<string, AgentChat[]>;
  running: Record<string, boolean>;
  startedMs: Record<string, number>;
  routines: Routine[];
  runs: Record<string, RoutineRun[]>;
  waitingChats: string[];
  agents: AgentProfile[];
  isParked: (run: RoutineRun | undefined, waiting: string[]) => boolean;
}

export function liveWork(input: LiveWorkInput): Live[] {
  const { chats, running, startedMs, routines, runs, waitingChats, agents, isParked } = input;
  const named = (id: string | null) =>
    agents.find((agent) => agent.id === id)?.name ?? "Detached";

  if (input.tasks) {
    const live: Live[] = input.tasks.filter((task) => task.status === "running" || task.status === "waiting").map((task) => ({
      key: task.id, who: task.spec.agentName, what: task.spec.prompt || "New task",
      parked: task.status === "waiting", startedMs: task.startedMs, chatId: task.chatId, agentId: task.agentId,
    }));
    for (const id of Object.keys(running).filter((id) => running[id] && !live.some((task) => task.chatId === id))) {
      const chat = Object.values(chats).flat().find((chat) => chat.id === id);
      live.push({ key: id, who: chat ? named(chat.agentId) : "Teammate", what: "Preparing task…", parked: false,
        startedMs: startedMs[id] ?? null, chatId: chat ? id : null, agentId: chat?.agentId ?? null });
    }
    return live;
  }

  const live: Live[] = [];
  const seen = new Set<string>();

  for (const routine of routines) {
    const run = (runs[routine.id] ?? [])[0];
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
      const live_ = running[chat.id] || chat.state === "running";
      if (!live_ || seen.has(chat.id)) continue;
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

  return live;
}
