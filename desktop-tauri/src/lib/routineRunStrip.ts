import type { RoutineRun } from "../agentWorkTypes";

// The last dozen outcomes, as marks — the cheapest possible answer to "is this
// thing actually running?".
//
// Three colours and no legend: amber is a skip, which is a fact about the
// laptop being shut and not a failure; red is a real failure and the row says
// why in words beside it; cobalt is the run happening now. A routine that has
// never worked shows an empty strip, which is itself the answer.

/** How many marks the strip shows. Twelve is a fortnight of a daily routine. */
export const STRIP_LENGTH = 12;

export interface RunMark {
  id: string;
  status: RoutineRun["status"];
  /** What a pointer over this mark should say. */
  title: string;
}

function when(run: RoutineRun): string {
  const at = run.startedMs ?? run.scheduledMs;
  if (!at) return "";
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function markTitle(run: RoutineRun): string {
  const at = when(run);
  const stamp = at ? ` · ${at}` : "";
  if (run.status === "failed") return `Failed: ${run.error ?? "no reason recorded"}${stamp}`;
  if (run.status === "skipped") return `Skipped — Vibyra was closed${stamp}`;
  if (run.status === "running") return `Running now${stamp}`;
  return `Completed${stamp}`;
}

/**
 * The strip, oldest first.
 *
 * `runs` arrives newest first — the order `loadRuns` stores — so this takes
 * the newest twelve and reverses them: a strip is read left to right as time
 * passing, and the most recent outcome belongs under the sentence describing
 * it at the right-hand end.
 */
export function runStrip(runs: readonly RoutineRun[]): RunMark[] {
  return runs
    .slice(0, STRIP_LENGTH)
    .map((run) => ({ id: run.id, status: run.status, title: markTitle(run) }))
    .reverse();
}

/** The sentence under the name. Words, because "failed" and "skipped" both
 *  need a reason and a pill cannot carry one. */
export function lastRunLine(run: RoutineRun | undefined): string {
  if (!run) return "";
  if (run.status === "running") return "Running now";
  if (run.status === "failed") return `Last run failed: ${run.error ?? "no reason given"}`;
  if (run.status === "skipped") return "Last run skipped — Vibyra was closed.";
  return "Last run completed.";
}
