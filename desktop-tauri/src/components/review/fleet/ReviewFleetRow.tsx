import { rowLabel } from "../../../lib/reviewDerive";
import type { FleetRow, FleetStatus } from "../../../lib/reviewFleet";
import { canLandInline } from "../../../lib/reviewFleetActionPolicy";
import { useReviewStore } from "../../../state/reviewStore";
import type { PaneState } from "../../../state/terminalStoreTypes";
import { AgentMark } from "../../common/AgentMark";
import { GitBranchIcon } from "../../common/Icons";

interface Props {
  row: FleetRow;
  /** Null for an orphan: the worktree outlived the terminal that made it. */
  pane: PaneState | null;
  contested: boolean;
  blocked: boolean;
  root: string;
}

/**
 * The dots are the pane grid's own `adot` classes, so a green dot means the
 * same thing in the dock as it does under the terminal. Only `ready` is new —
 * the grid has no word for "stopped, and left something behind" — and it takes
 * the accent rather than another green precisely so it cannot be mistaken for
 * `working` at a glance. Telling those two apart is the entire fleet.
 */
const DOT: Record<FleetStatus, string> = {
  ready: "adot--ready",
  working: "adot--working",
  attention: "adot--attention",
  idle: "adot--idle",
  orphaned: "adot--sleeping",
};

const WORD: Record<FleetStatus, string> = {
  ready: "ready",
  working: "working",
  attention: "needs you",
  idle: "idle",
  orphaned: "no terminal",
};

function tallyLabel(row: FleetRow): string {
  const { files, additions, deletions } = row.summary;
  return `${files === 1 ? "1 file" : `${files} files`} changed, ${additions} added, ${deletions} removed`;
}

export function ReviewFleetRow({ row, pane, contested, blocked, root }: Props) {
  const select = useReviewStore((state) => state.select);
  const merge = useReviewStore((state) => state.merge);
  const busyPane = useReviewStore((state) => state.busyPane);
  const canLand = pane !== null && canLandInline(row, blocked);

  const body = (
    <>
      <span className="fleet-row__top">
        <span className={`adot ${DOT[row.status]}`} aria-hidden="true" />
        {pane ? (
          <AgentMark agentId={pane.agentId} name={row.title} accent={pane.accent} size={18} />
        ) : (
          <span className="fleet-row__orphan-mark" aria-hidden="true">
            <GitBranchIcon size={13} />
          </span>
        )}
        <span className="fleet-row__name">{row.title}</span>
        {row.paneId !== null && <em className="fleet-row__pane">#{row.paneId}</em>}
        {contested && (
          <span
            className={`fleet-pip ${blocked ? "fleet-pip--warn" : ""}`}
            role="img"
            title={
              blocked
                ? "Another workspace has changed the same lines"
                : "Another workspace has changed the same file"
            }
            aria-label={blocked ? "Overlaps another workspace" : "Shares a file with another workspace"}
          />
        )}
        <span className="fleet-row__state">{WORD[row.status]}</span>
      </span>
      <span className="fleet-row__meta">
        <code className="fleet-row__branch" title={row.branch}>
          {row.branch}
        </code>
        {row.stale ? (
          <span className="fleet-row__tally">not read yet</span>
        ) : (
          <span className="fleet-row__tally" aria-label={tallyLabel(row)}>
            {row.summary.files === 1 ? "1 file" : `${row.summary.files} files`}
            <em className="review-add">+{row.summary.additions}</em>
            <em className="review-del">−{row.summary.deletions}</em>
          </span>
        )}
      </span>
    </>
  );

  return (
    <div className="fleet-row" role="listitem">
      {row.paneId === null ? (
        // An orphan has nowhere to send you: no terminal, and no changeset
        // worth opening for a workspace nothing is still writing to. It is
        // here to be seen and cleaned up, so it stays inert rather than
        // pretending to be a link.
        <div className="fleet-row__open fleet-row__open--static">{body}</div>
      ) : (
        // No aria-label on the button: one would *replace* everything inside
        // it, and the state, branch and tally are the row. The content names
        // it instead, which is why each of those carries its own wording.
        <button
          type="button"
          className="fleet-row__open"
          title={`Open ${rowLabel(row)}'s changes`}
          onClick={() => select(row.paneId)}
        >
          {body}
        </button>
      )}
      {canLand && (
        <button
          type="button"
          className="btn btn--primary fleet-row__land"
          disabled={busyPane !== null}
          onClick={() => void merge(pane, root)}
        >
          Land
        </button>
      )}
    </div>
  );
}
