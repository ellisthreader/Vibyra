import { useState } from "react";

import { rowLabel } from "../../../lib/reviewDerive";
import type { FleetRow, FleetStatus } from "../../../lib/reviewFleet";
import { canLandInline } from "../../../lib/reviewFleetActionPolicy";
import { discardCopy } from "../../../lib/reviewPolicy";
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

/**
 * Sentences, not git words (Ellis, 2026-08-29). The row has to be understood
 * by someone who has never heard of a worktree: what the agent is doing, in
 * the words a person would use.
 *
 * `orphaned` used to read "Terminal closed — work saved", which said the two
 * things it should not. It led with the terminal, which is the part the user
 * has already forgotten about and cannot act on, and it promised the work was
 * kept — a claim the fleet never checks, since an orphan's changeset is never
 * read. What is actually known is that nothing owns the copy any more.
 */
const WORD: Record<FleetStatus, string> = {
  ready: "Ready to review",
  working: "Still working…",
  attention: "Waiting for you",
  idle: "No changes yet",
  orphaned: "Nothing is using this",
};

function tallyLabel(row: FleetRow): string {
  const { files, additions, deletions } = row.summary;
  return `${files === 1 ? "1 file" : `${files} files`} changed, ${additions} added, ${deletions} removed`;
}

export function ReviewFleetRow({ row, pane, contested, blocked, root }: Props) {
  const select = useReviewStore((state) => state.select);
  const merge = useReviewStore((state) => state.merge);
  const discard = useReviewStore((state) => state.discard);
  const busyPane = useReviewStore((state) => state.busyPane);
  const [rejecting, setRejecting] = useState(false);
  const busy = busyPane !== null;
  const actionable = pane !== null && row.status === "ready";
  const canApprove = pane !== null && canLandInline(row, blocked);

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
                ? "Another agent has changed the same lines"
                : "Another agent has changed the same file"
            }
            aria-label={blocked ? "Overlaps another agent's work" : "Shares a file with another agent"}
          />
        )}
      </span>
      <span className="fleet-row__meta">
        <span className={`fleet-row__state fleet-row__state--${row.status}`}>{WORD[row.status]}</span>
        {/* A leftover's changeset is never fetched, so "not read yet" would
            promise a read that is not coming. It gets no tally at all. */}
        {row.paneId === null ? null : row.stale ? (
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
        // it, and the state and tally are the row. The branch keeps living in
        // the tooltip for anyone who wants the git name.
        <button
          type="button"
          className="fleet-row__open"
          title={`Look at ${rowLabel(row)}'s changes (${row.branch})`}
          onClick={() => select(row.paneId)}
        >
          {body}
        </button>
      )}
      {actionable && !rejecting && (
        <span className="fleet-row__acts">
          {canApprove && (
            <button
              type="button"
              className="act act--approve fleet-row__act"
              title="Put this work into your project"
              disabled={busy}
              onClick={() => void merge(pane, root)}
            >
              Approve
            </button>
          )}
          <button
            type="button"
            className="act act--reject fleet-row__act"
            title="Throw this work away"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            Reject
          </button>
        </span>
      )}
      {actionable && rejecting && (
        <div className="fleet-row__confirm">
          <em>{discardCopy(row.summary, pane.status === "running")}</em>
          <span className="fleet-row__acts">
            <button
              type="button"
              className="act fleet-row__act"
              disabled={busy}
              onClick={() => setRejecting(false)}
            >
              Keep it
            </button>
            <button
              type="button"
              className="act act--reject fleet-row__act"
              disabled={busy}
              onClick={() => void discard(pane, root)}
            >
              Yes, delete it
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
