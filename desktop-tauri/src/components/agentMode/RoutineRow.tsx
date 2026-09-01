import { useEffect } from "react";

import type { Routine } from "../../agentTypes";
import { NONE } from "../../lib/emptyList";
import { relativeTime } from "../../lib/relativeTime";
import { lastRunLine, runStrip } from "../../lib/routineRunStrip.ts";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { AgentMark } from "../common/AgentMark";

/**
 * One routine, with what it did last, what it did before that, and what it
 * will do next.
 *
 * The last result is a sentence rather than a status pill, because the useful
 * cases are "it failed and here is why" and "it was skipped because the app
 * was shut" — both of which need words. The strip beside it is the twelve
 * before that, which is the cheapest possible answer to "is this thing
 * actually running?".
 *
 * The agent's mark leads the row. A routine is not a scheduled prompt; it is a
 * teammate doing its own job on a clock — its engine, its permission, its
 * places, its memory — so a list of routines should read as a list of
 * teammates rather than a list of timers.
 *
 * The run history refetches when the bus hears `routine-status` for this
 * routine. Before that listener existed this mounted once and never moved
 * again, which is how a routine could run, fail, and leave the row still
 * showing yesterday.
 */
export function RoutineRow({
  routine,
  agentName,
  agentId,
  accent,
  onEdit,
}: {
  routine: Routine;
  agentName: string;
  agentId: string;
  accent: string;
  onEdit: () => void;
}) {
  const runs = useAgentWorkStore((state) => state.runs[routine.id] ?? NONE);
  const loadRuns = useAgentWorkStore((state) => state.loadRuns);
  const setEnabled = useAgentWorkStore((state) => state.setRoutineEnabled);
  const remove = useAgentWorkStore((state) => state.deleteRoutine);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const selectChat = useAgentModeStore((state) => state.selectChat);
  const openChat = useAgentChatStore((state) => state.openChat);

  useEffect(() => {
    void loadRuns(routine.id);
  }, [loadRuns, routine.id]);

  const last = runs[0];
  const strip = runStrip(runs);

  // A routine that produced work nobody ever saw is the failure this whole
  // design is about, so the last run is a way into the chat it created.
  const open = () => {
    if (!last?.chatId) return;
    selectAgent(agentId);
    selectChat(last.chatId);
    void openChat(last.chatId);
  };

  return (
    <li className={`routine-row ${routine.enabled ? "" : "is-paused"}`}>
      <div className="routine-row__main">
        <span className="routine-row__name">
          <AgentMark agentId={agentId} name={agentName} accent={accent} size={16} />
          {routine.name}
        </span>
        <span className="routine-row__meta">
          {agentName} · {routine.description} · {routine.timezone}
        </span>
        <span className="routine-row__meta">
          {routine.permission === "plan" ? "Plan only" : `Runs with ${routine.permission} access`}
        </span>
        {last &&
          (last.chatId ? (
            <button
              type="button"
              className={`routine-row__last routine-row__last--${last.status} is-link`}
              onClick={open}
            >
              {lastRunLine(last)}
            </button>
          ) : (
            <span className={`routine-row__last routine-row__last--${last.status}`}>
              {lastRunLine(last)}
            </span>
          ))}
        {strip.length > 0 ? (
          <span className="run-strip" role="img" aria-label={`Last ${strip.length} runs`}>
            {strip.map((mark) => (
              <i key={mark.id} className={`run-strip__m run-strip__m--${mark.status}`} title={mark.title} />
            ))}
          </span>
        ) : (
          <span className="run-strip run-strip--empty">No runs yet.</span>
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
