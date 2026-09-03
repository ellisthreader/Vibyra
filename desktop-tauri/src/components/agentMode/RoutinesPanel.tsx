import { useEffect, useState } from "react";

import { ClockIcon } from "../common/AgentIcons";
import { PlusIcon, UserIcon } from "../common/Icons";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { useSettingsStore } from "../../state/settingsStore";
import { EmptyState } from "./EmptyState";
import { PanelHead } from "./PanelHead";
import { RoutineEditor } from "./RoutineEditor";
import { RoutineRow } from "./RoutineRow";

/**
 * Scheduled work.
 *
 * The limit is stated in the head rather than implied. Routines run while
 * Vibyra is open, missed runs are skipped rather than caught up, and a person
 * reading this should not have to discover either by noticing that Monday's
 * standup never happened. The heartbeat under the list is the answer to "is
 * this thing on?" — an empty panel that says when it last looked is very
 * different from an empty panel that says nothing.
 */
export function RoutinesPanel() {
  const lastCheckedMs = useAgentWorkStore((state) => state.lastCheckedMs);
  const routines = useAgentWorkStore((state) => state.routines);
  const load = useAgentWorkStore((state) => state.loadRoutines);
  const agents = useAgentRosterStore((state) => state.agents);
  const paused = useSettingsStore((state) => state.settings?.routinesPaused ?? false);
  const update = useSettingsStore((state) => state.update);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    void load(null);
  }, [load]);

  const checked = lastCheckedMs
    ? `Last checked ${new Date(lastCheckedMs).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}.`
    : "";

  return (
    <div className="panel">
      <div className="panel__inner">
        <PanelHead
          title="Routines"
          blurb="A routine opens a fresh chat each time it runs, as the teammate that owns it. They run while Vibyra is open; a run missed because the app was closed is skipped, never caught up in a burst."
          actions={
            agents.length > 0 && (
              <button className="btn btn--sm btn--primary" onClick={() => setEditing("new")}>
                <PlusIcon size={13} /> New routine
              </button>
            )
          }
        />

        {agents.length === 0 ? (
          <EmptyState
            icon={<UserIcon size={18} />}
            title="Create a teammate first"
            body="A routine runs as one of your teammates — with its brief, its folders and its access level."
          />
        ) : (
          <>
            {editing && (
              <RoutineEditor
                routineId={editing === "new" ? undefined : editing}
                onClose={() => setEditing(null)}
              />
            )}

            {routines.length > 0 && (
              <div className="settings-group">
                <label className="setting-row">
                  <span className="setting-row__text">
                    <span className="setting-row__label">Pause every routine</span>
                    <span className="setting-row__hint">
                      {paused
                        ? "Nothing will run. The next times below are what they would be."
                        : "Stops the clock for all of them at once. Each keeps its own schedule."}
                    </span>
                  </span>
                  <span className="setting-row__control">
                    <input
                      type="checkbox"
                      checked={paused}
                      onChange={(event) => void update({ routinesPaused: event.target.checked })}
                    />
                  </span>
                </label>
              </div>
            )}

            {routines.length === 0 ? (
              <EmptyState
                icon={<ClockIcon size={18} />}
                title="No routines yet"
                body="Give a teammate something to do on a clock — a morning check, an overnight summary, a weekly sweep."
                action={
                  <button className="btn btn--primary" onClick={() => setEditing("new")}>
                    <PlusIcon size={13} /> New routine
                  </button>
                }
              />
            ) : (
              <section className="panel__section">
                <div className="panel__section-head">
                  <span className="section-label">Scheduled</span>
                  <span className="panel__count">{routines.length}</span>
                </div>
                <ul className="rows">
                  {routines.map((routine) => {
                    const owner = agents.find((agent) => agent.id === routine.agentId);
                    return (
                      <RoutineRow
                        key={routine.id}
                        routine={routine}
                        agentId={routine.agentId}
                        agentName={owner?.name ?? "—"}
                        accent={owner?.accent || "var(--accent)"}
                        onEdit={() => setEditing(routine.id)}
                      />
                    );
                  })}
                </ul>
              </section>
            )}
            <p className="panel__quiet">Vibyra looks once a minute while it is open. {checked}</p>
          </>
        )}
      </div>
    </div>
  );
}
