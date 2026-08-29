import { useEffect, useState } from "react";

import { relativeTime } from "../../lib/relativeTime";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { useSettingsStore } from "../../state/settingsStore";
import { RoutineEditor } from "./RoutineEditor";
import { RoutineRow } from "./RoutineRow";

/**
 * Scheduled work.
 *
 * The limit is stated at the top rather than implied. Routines run while
 * Vibyra is open, missed runs are skipped rather than caught up, and a person
 * reading this should not have to discover either by noticing that Monday's
 * standup never happened.
 */
export function RoutinesPanel() {
  const routines = useAgentWorkStore((state) => state.routines);
  const load = useAgentWorkStore((state) => state.loadRoutines);
  const agents = useAgentRosterStore((state) => state.agents);
  const paused = useSettingsStore((state) => state.settings?.routinesPaused ?? false);
  const update = useSettingsStore((state) => state.update);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <div className="panel">
      <header className="panel__head">
        <h2>Routines</h2>
        <p>
          A routine opens a fresh chat each time it runs. They run while Vibyra is open; a run
          missed because the app was closed is skipped, never caught up in a burst.
        </p>
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={paused}
            onChange={(event) => void update({ routinesPaused: event.target.checked })}
          />
          Pause every routine
        </label>
      </header>

      {agents.length === 0 ? (
        <p className="panel__quiet">Create a teammate first — a routine runs as one.</p>
      ) : (
        <>
          <button className="panel__new" onClick={() => setEditing("new")}>
            New routine
          </button>
          {editing && (
            <RoutineEditor
              routineId={editing === "new" ? undefined : editing}
              onClose={() => setEditing(null)}
            />
          )}
          {routines.length === 0 ? (
            <p className="panel__quiet">No routines yet.</p>
          ) : (
            <ul className="routine-list">
              {routines.map((routine) => (
                <RoutineRow
                  key={routine.id}
                  routine={routine}
                  agentName={agents.find((agent) => agent.id === routine.agentId)?.name ?? "—"}
                  onEdit={() => setEditing(routine.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {routines.length > 0 && paused && (
        <p className="panel__quiet">
          Paused — nothing will run. The next run times below are what they would be.
        </p>
      )}
      <p className="panel__quiet panel__quiet--foot">
        {routines.length > 0 &&
          `Last checked ${relativeTime(Date.now())}. Vibyra looks once a minute.`}
      </p>
    </div>
  );
}
