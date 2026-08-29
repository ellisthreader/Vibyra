import { useEffect } from "react";

import type { Routine } from "../../agentTypes";
import { relativeTime } from "../../lib/relativeTime";
import { useAgentWorkStore } from "../../state/agentWorkStore";

/**
 * One routine, with what it did last and what it will do next.
 *
 * The last result is shown as a sentence rather than a status pill, because
 * the useful cases are "it failed and here is why" and "it was skipped because
 * the app was shut" — both of which need words.
 */
export function RoutineRow({
  routine,
  agentName,
  onEdit,
}: {
  routine: Routine;
  agentName: string;
  onEdit: () => void;
}) {
  const runs = useAgentWorkStore((state) => state.runs[routine.id] ?? []);
  const loadRuns = useAgentWorkStore((state) => state.loadRuns);
  const setEnabled = useAgentWorkStore((state) => state.setRoutineEnabled);
  const remove = useAgentWorkStore((state) => state.deleteRoutine);

  useEffect(() => {
    void loadRuns(routine.id);
  }, [loadRuns, routine.id]);

  const last = runs[0];

  return (
    <li className={`routine-row ${routine.enabled ? "" : "is-paused"}`}>
      <div className="routine-row__main">
        <span className="routine-row__name">{routine.name}</span>
        <span className="routine-row__meta">
          {agentName} · {routine.description} · {routine.timezone}
        </span>
        <span className="routine-row__meta">
          {routine.permission === "plan" ? "Plan only" : `Runs with ${routine.permission} access`}
        </span>
        {last && (
          <span
            className={`routine-row__last routine-row__last--${last.status}`}
          >
            {last.status === "failed" && `Last run failed: ${last.error ?? "no reason given"}`}
            {last.status === "skipped" && "Last run skipped — Vibyra was closed."}
            {last.status === "completed" && `Last ran ${relativeTime(last.endedMs ?? 0)}`}
            {last.status === "running" && "Running now"}
          </span>
        )}
      </div>
      <div className="routine-row__side">
        <span className="routine-row__next">
          {routine.enabled && routine.nextRunMs
            ? `Next ${relativeTime(routine.nextRunMs)}`
            : "Paused"}
        </span>
        <div className="routine-row__actions">
          <button className="btn-ghost" onClick={() => void setEnabled(routine.id, !routine.enabled)}>
            {routine.enabled ? "Pause" : "Resume"}
          </button>
          <button className="btn-ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="btn-ghost" onClick={() => void remove(routine.id)}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
