import { useState } from "react";

import { rowLabel } from "../../../lib/reviewDerive";
import type { FleetRow } from "../../../lib/reviewFleet";
import {
  landReport,
  landableRows,
  type LandAttempt,
  type LandReport,
} from "../../../lib/reviewFleetActionPolicy";
import { useReviewStore } from "../../../state/reviewStore";
import type { PaneState } from "../../../state/terminalStoreTypes";

interface Props {
  rows: FleetRow[];
  panes: PaneState[];
  root: string;
}

/**
 * Land every finished workspace that still applies, one after another.
 *
 * Sequential, never parallel, and that is not a performance choice: each land
 * rewrites the working tree the next one has to patch onto, so two running at
 * once would race over the same checkout and the loser would fail for a reason
 * that has nothing to do with the agent that wrote it.
 *
 * Blocked workspaces are attempted too. The three-way check is the arbiter
 * here, not the radar's guess — the radar's job is to withhold the *one-click*
 * Land from a row, while this action is the user explicitly asking for
 * whatever will go. What bounces is named and linked, never swallowed.
 */
export function ReviewFleetFooter({ rows, panes, root }: Props) {
  const merge = useReviewStore((state) => state.merge);
  const select = useReviewStore((state) => state.select);
  const busyPane = useReviewStore((state) => state.busyPane);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<LandReport | null>(null);

  const targets = landableRows(rows);

  const run = async (): Promise<void> => {
    if (running || useReviewStore.getState().busyPane !== null) return;
    setRunning(true);
    setReport(null);
    const attempts: LandAttempt[] = [];
    for (const row of targets) {
      const pane = panes.find((candidate) => candidate.id === row.paneId);
      if (!pane) continue;
      // A land that throws leaves the *previous* outcome in place, and reading
      // that back would report last time's success as this one's. Only a
      // freshly written outcome counts as an answer.
      const before = useReviewStore.getState().outcomeByPane[pane.id];
      await merge(pane, root);
      const after = useReviewStore.getState().outcomeByPane[pane.id];
      attempts.push({
        key: row.key,
        paneId: pane.id,
        label: rowLabel(row),
        applied: after !== before && after?.applied === true,
      });
    }
    setReport(landReport(attempts));
    setRunning(false);
  };

  // The report outlives the button on purpose: landing is exactly what stops
  // those rows being ready, so a footer that unmounted with them would take
  // the result of the run away in the same frame it arrived.
  if (targets.length < 2 && report === null) return null;

  return (
    <footer className="fleet-foot">
      {report && (
        <p className="fleet-foot__report" role="status">
          <strong>{report.text}</strong>
          {report.stuck.map((attempt) => (
            <button
              key={attempt.key}
              type="button"
              className="fleet-foot__stuck"
              onClick={() => select(attempt.paneId)}
            >
              {attempt.label}
            </button>
          ))}
        </p>
      )}
      {targets.length >= 2 && (
        <>
          <button
            type="button"
            className="btn btn--approve fleet-foot__land"
            disabled={running || busyPane !== null}
            onClick={() => void run()}
          >
            {running ? "Approving…" : `Approve all ${targets.length} that are ready`}
          </button>
          <p className="fleet-foot__hint">
            Each one is safety-checked against your project first; anything that doesn't fit
            cleanly is left for you.
          </p>
        </>
      )}
    </footer>
  );
}
