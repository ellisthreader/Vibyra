import { useEffect } from "react";

import type { Routine } from "../../agentTypes";
import { TrashIcon } from "../common/AgentIcons";
import { NONE } from "../../lib/emptyList";
import { relativeTime } from "../../lib/relativeTime";
import { isParked, lastRunLine, runStrip } from "../../lib/routineRunStrip.ts";
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
const ACCESS: Record<Routine["permission"], string> = {
  plan: "Plan only",
  standard: "Standard access",
  full: "Full access",
};

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
  const runNow = useAgentWorkStore((state) => state.runNow);
  const waitingChats = useAgentWorkStore((state) => state.approvalChatIds);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const selectChat = useAgentModeStore((state) => state.selectChat);
  const openChat = useAgentChatStore((state) => state.openChat);

  useEffect(() => {
    void loadRuns(routine.id);
  }, [loadRuns, routine.id]);

  const last = runs[0];
  const strip = runStrip(runs);
  const parked = isParked(last, waitingChats);
  const busy = last?.status === "running";
  const lastClass = `routine-row__last routine-row__last--${parked ? "parked" : last?.status}`;

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
      <div className="row">
        <AgentMark agentId={agentId} name={agentName} accent={accent} size={22} />
        <span className="row__text">
          <span className="row__title">
            <span>{routine.name}</span>
            {!routine.enabled && <span className="panel__count">Paused</span>}
          </span>
          <span className="row__meta">
            {agentName} · {routine.description} · {ACCESS[routine.permission]}
          </span>
          {last &&
            (last.chatId ? (
              <button type="button" className={`${lastClass} is-link`} onClick={open}>
                {lastRunLine(last, parked)}
              </button>
            ) : (
              <span className={lastClass}>{lastRunLine(last, parked)}</span>
            ))}
        </span>
        <span className="row__side routine-row__side">
          {strip.length > 0 ? (
            <span className="run-strip" role="img" aria-label={`Last ${strip.length} runs`}>
              {strip.map((mark) => (
                <i
                  key={mark.id}
                  className={`run-strip__m run-strip__m--${mark.status}`}
                  title={mark.title}
                />
              ))}
            </span>
          ) : (
            <span className="run-strip run-strip--empty">No runs yet</span>
          )}
          <span className="row__when">
            {routine.enabled && routine.nextRunMs ? `Next ${relativeTime(routine.nextRunMs)}` : ""}
          </span>
        </span>
      </div>
      <div className="routine-row__actions">
        {last?.chatId && (busy || parked) ? (
          <button className="btn btn--sm" onClick={open}>
            Open chat
          </button>
        ) : (
          <button
            className="btn btn--sm"
            disabled={!routine.enabled}
            title={
              routine.enabled
                ? "Run it now. The schedule is untouched."
                : "Resume it first — a paused routine does not run."
            }
            onClick={() => void runNow(routine.id)}
          >
            Run now
          </button>
        )}
        <button
          className="btn btn--sm btn--secondary"
          onClick={() => void setEnabled(routine.id, !routine.enabled)}
        >
          {routine.enabled ? "Pause" : "Resume"}
        </button>
        <button className="btn btn--sm btn--secondary" onClick={onEdit}>
          Edit
        </button>
        <button
          className="icon-btn icon-btn--danger"
          title="Delete this routine"
          onClick={() => void remove(routine.id)}
        >
          <TrashIcon size={13} />
        </button>
      </div>
    </li>
  );
}
