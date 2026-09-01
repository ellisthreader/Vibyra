/** What a tool call did, said as a verb and a thing it was done to. */
export interface ToolShape {
  verb: string;
  target: string;
}

// Turning a provider's tool name into something a person can scan.
//
// A column of tool blocks is read for one thing: which of these mattered. That
// needs a verb, because "Read" and "Run" have completely different weight and
// "Bash" has none. The two engines name the same operations differently —
// Claude sends its tool names, Codex sends `shell` for everything it executes
// — so the mapping is here rather than in either adapter.
//
// An unknown tool keeps its own name rather than being forced into a verb that
// might be wrong. A tool called something this table has never seen is more
// honestly shown as itself than as a guess.

const VERBS: Record<string, string> = {
  bash: "Run",
  shell: "Run",
  run: "Run",
  read: "Read",
  write: "Write",
  edit: "Edit",
  multiedit: "Edit",
  notebookedit: "Edit",
  glob: "Find",
  grep: "Search",
  search: "Search",
  websearch: "Search",
  webfetch: "Fetch",
  task: "Delegate",
  todowrite: "Plan",
  todo_list: "Plan",
  file_change: "Edit",
  apply_patch: "Edit",
};

/** The last two segments of a path, which is what identifies a file on sight. */
function tailOfPath(value: string): string {
  const parts = value.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : value;
}

/**
 * A command's own shape, kept: the program plus enough of its arguments to be
 * recognisable, cut at the first thing that makes a shell line long.
 */
function commandSummary(summary: string): string {
  const firstLine = summary.split("\n")[0].trim();
  return firstLine.length > 92 ? `${firstLine.slice(0, 91)}…` : firstLine;
}

export function toolShape(tool: string, summary: string): ToolShape {
  const key = tool.trim().toLowerCase().replace(/[\s-]/g, "_");
  const verb = VERBS[key] ?? VERBS[key.replace(/_/g, "")] ?? tool.trim() ?? "Tool";
  const trimmed = summary.trim();
  if (!trimmed) return { verb, target: "" };
  // A path is worth shortening from the left; a command is not, because its
  // program name is the first thing on the line.
  const target =
    verb === "Run" ? commandSummary(trimmed) : tailOfPath(commandSummary(trimmed));
  return { verb, target };
}

/** Elapsed time, at the precision a person cares about at each scale. */
export function toolElapsed(startedMs: number, endedMs: number | null): string {
  if (endedMs === null) return "";
  const ms = Math.max(0, endedMs - startedMs);
  if (ms < 950) return `${Math.round(ms / 100) / 10}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}
