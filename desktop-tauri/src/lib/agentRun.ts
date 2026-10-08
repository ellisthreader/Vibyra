import type { AgentItem, ConversationSnapshot } from "../ipc/sharedChats";

// What one agent chat is doing, read from its conversation snapshot: the last
// thing you asked, the step it is on, what it found, and the run's numbers.
// Pure, so Home's agent panels and their tests read it the same way.

export type RunState = "working" | "waiting" | "done" | "failed" | "stopped" | "ready";

export interface AgentRun {
  state: RunState;
  ask: string | null;
  step: { title: string; command: string | null } | null;
  found: string | null;
  steps: number;
  commands: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
}

const EMPTY: AgentRun = { state: "ready", ask: null, step: null, found: null, steps: 0, commands: 0, startedAt: null, finishedAt: null, durationMs: null };

/** `/bin/zsh -lc "rg -n …"` → `rg -n …`, on one line. */
export function cleanCommand(command: string | undefined): string | null {
  if (!command?.trim()) return null;
  const wrapped = command.trim().match(/^\/bin\/(?:ba|z)?sh\s+-l?c\s+(["'])([\s\S]*)\1$/);
  return (wrapped ? wrapped[2] : command).replace(/\s+/g, " ").trim();
}

/** Markdown reply → one plain paragraph. */
export function plainReply(text: string | undefined): string | null {
  const plain = (text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]+/g, "").replace(/^\s*[-•]\s+/gm, "").replace(/\s+/g, " ").trim();
  return plain || null;
}

const time = (value: string | undefined) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

function stateOf(snapshot: ConversationSnapshot, finished: boolean, asked: boolean): RunState {
  switch (snapshot.turnState) {
    case "running": return "working";
    case "waiting": return "waiting";
    case "failed": return "failed";
    case "interrupted": return finished ? "done" : "stopped";
    case "completed": return "done";
    default: return finished ? "done" : asked ? "stopped" : "ready";
  }
}

export function agentRun(snapshot: ConversationSnapshot | null): AgentRun {
  if (!snapshot) return EMPTY;
  const items = snapshot.items;
  const asked = [...items].reverse().find((item) => item.kind === "message" && item.role === "user");
  // A long chat's snapshot can start after its last request: the newest turn
  // with any item still says what the agent did and found.
  const newest = [...items].reverse().find((item) => item.turnId)?.turnId;
  const turn = snapshot.turnState === "running" || snapshot.turnState === "waiting"
    ? snapshot.turnId ?? asked?.turnId ?? newest : asked?.turnId ?? newest;
  if (!turn) return { ...EMPTY, state: stateOf(snapshot, false, false) };
  const own = items.filter((item) => item.turnId === turn);
  const activities = own.filter((item) => item.kind === "activity");
  const result = [...own].reverse().find((item) => item.kind === "result");
  const reply = [...own].reverse().find((item) => item.kind === "message" && item.role === "assistant");
  const question = [...own].reverse().find((item) => item.kind === "permission" || item.kind === "question");
  const state = stateOf(snapshot, Boolean(result), Boolean(asked));
  const last: AgentItem | undefined = state === "waiting" && question ? question : activities.at(-1);
  return {
    state,
    ask: plainReply(asked?.turnId === turn ? asked.text : undefined),
    step: last ? { title: last.title || "Working", command: cleanCommand(last.command) ?? plainReply(last.detail) } : null,
    found: plainReply(reply?.text) ?? plainReply(result?.text),
    steps: activities.length,
    commands: activities.filter((item) => Boolean(item.command)).length,
    startedAt: time(asked?.startedAt) ?? time(activities[0]?.startedAt),
    finishedAt: time(result?.updatedAt),
    durationMs: typeof result?.durationMs === "number" ? result.durationMs : null,
  };
}

/** 53s · 2m 10s · 1h 4m */
export function shortDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
