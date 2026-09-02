import { useState } from "react";

import type { FleetRow } from "../../../lib/reviewFleet";
import { leftoverSummary } from "../../../lib/reviewLeftovers";
import { useWorkspaceStore } from "../../../state/workspaceStore";
import { ChevronIcon } from "../../common/Icons";
import { ReviewFleetRow } from "./ReviewFleetRow";

interface Props {
  rows: FleetRow[];
  root: string;
}

/**
 * The leftovers, folded into one line.
 *
 * Shut by default, because the fleet's question is "who is done" and a
 * leftover can never be an answer to it. Open on request, because the one
 * thing worse than a wall of housekeeping is housekeeping you cannot see.
 *
 * Deleting is deliberately not offered here. Settings ▸ Safe workspaces
 * already owns that — with the disk figure, the per-row delete and the sweep —
 * and a second delete path in a panel whose whole job is landing work is how
 * you end up with two confirmations that behave differently. This links there
 * instead.
 */
export function ReviewLeftovers({ rows, root }: Props) {
  const openSettings = useWorkspaceStore((state) => state.openSettingsSection);
  const [open, setOpen] = useState(false);

  if (rows.length === 0) return null;

  return (
    <section className="fleet-left" data-open={open || undefined}>
      <button
        type="button"
        className="fleet-left__head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronIcon size={12} />
        <span className="fleet-left__title">{leftoverSummary(rows.length)}</span>
        <span className="fleet-left__note">no terminal is using them</span>
      </button>
      {open && (
        <>
          <p className="fleet-left__blurb">
            Safe copies whose terminal was closed without landing or discarding the work.
            Nothing here is running, and nothing has touched your project.
          </p>
          <div className="fleet-left__list" role="list">
            {rows.map((row) => (
              <ReviewFleetRow
                key={row.key}
                row={row}
                pane={null}
                contested={false}
                blocked={false}
                root={root}
              />
            ))}
          </div>
          <button
            type="button"
            className="fleet-left__manage"
            onClick={() => openSettings("workspaces")}
          >
            Review and delete them in Settings
          </button>
        </>
      )}
    </section>
  );
}
