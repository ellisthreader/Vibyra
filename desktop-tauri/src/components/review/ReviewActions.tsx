import { useState } from "react";

import { mergeWarning, summarize } from "../../lib/reviewPolicy";
import { selectionCount } from "../../lib/reviewSelection";
import type { WorktreeStatus } from "../../ipc/review";
import { useReviewStore } from "../../state/reviewStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { PaneState } from "../../state/terminalStoreTypes";
import { ChevronDownIcon, MoreIcon } from "../common/Icons";
import { ReviewPrSheet } from "./ReviewPrSheet";
import { ReviewConflictPanel } from "./changeset/ReviewConflictPanel";
import { ReviewMenu } from "./changeset/ReviewMenu";
import { CONFIRM_ACTION, confirmCopy, githubTitle, type Confirm } from "./changeset/changesetCopy";

interface Props {
  pane: PaneState;
  projectRoot: string;
  status: WorktreeStatus | null;
}

/**
 * How a review ends.
 *
 * Land is the primary action and the only one at that weight — discard is an
 * irreversible delete, and a delete sitting beside a land in the same button
 * shape is a mis-click waiting to happen, so it lives in the overflow as a
 * text button and states what it removes before it removes it. Both still
 * pause inline, the account-switch idiom, rather than opening a modal: the
 * sentence appears where the button was, so the thing you were reading and the
 * thing you are agreeing to are in the same place.
 */
export function ReviewActions({ pane, projectRoot, status }: Props) {
  const busyPane = useReviewStore((state) => state.busyPane);
  const outcome = useReviewStore((state) => state.outcomeByPane[pane.id]);
  const selection = useReviewStore((state) => state.selectionByPane[pane.id]);
  const github = useReviewStore((state) => state.github);
  const merge = useReviewStore((state) => state.merge);
  const discard = useReviewStore((state) => state.discard);
  const activity = useTerminalStore((state) => state.activity[pane.id] ?? "idle");
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [prOpen, setPrOpen] = useState(false);

  const busy = busyPane !== null;
  const summary = summarize(status);
  const count = selectionCount(status, selection);
  const left = summary.files - count;
  const warning = mergeWarning(activity);
  const alive = pane.status === "running";
  const githubReady = github !== null && github.ghInstalled && github.authed && github.origin !== null;
  const landLabel = count === 1 ? "Land 1 file" : `Land ${count} files`;

  const runMerge = async () => {
    setConfirming(null);
    await merge(pane, projectRoot);
  };

  /**
   * The common finishing move, as one action. The discard only runs if the
   * land actually applied — a conflict must leave the workspace exactly where
   * it was, which is the whole reason a blocked land is recoverable at all.
   */
  const runSweep = async () => {
    setConfirming(null);
    await merge(pane, projectRoot);
    if (useReviewStore.getState().outcomeByPane[pane.id]?.applied) {
      await discard(pane, projectRoot);
    }
  };

  if (confirming) {
    return (
      <footer className="review-actions review-actions--confirm">
        <em>{confirmCopy(confirming, { warning, summary, count, left, paneAlive: alive })}</em>
        <div className="review-actions__row">
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(null)}>
            Wait
          </button>
          <button
            type="button"
            className={`btn ${confirming === "discard" ? "btn--danger" : "btn--primary"}`}
            disabled={busy}
            onClick={() =>
              void (confirming === "merge"
                ? runMerge()
                : confirming === "sweep"
                  ? runSweep()
                  : discard(pane, projectRoot))
            }
          >
            {CONFIRM_ACTION[confirming]}
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="review-actions">
      {outcome?.applied && (
        <p className="review-outcome review-outcome--ok">
          Changes are in your project as ordinary edits — commit them when you're ready.
        </p>
      )}
      {outcome && !outcome.applied && outcome.conflicts.length === 0 && (
        <p className="review-outcome review-outcome--stuck">Nothing to merge yet.</p>
      )}
      {outcome && !outcome.applied && outcome.conflicts.length > 0 && (
        <ReviewConflictPanel pane={pane} root={projectRoot} conflicts={outcome.conflicts} />
      )}
      <div className="review-actions__row">
        <div className="review-actions__split">
          <button
            type="button"
            className="btn btn--primary review-actions__land"
            disabled={busy || count === 0}
            onClick={() => void (warning ? setConfirming("merge") : runMerge())}
          >
            {busyPane === pane.id ? "Working…" : landLabel}
          </button>
          <ReviewMenu
            label="More landing options"
            className="btn btn--primary review-actions__caret"
            glyph={<ChevronDownIcon size={13} />}
            disabled={busy || count === 0}
          >
            {(close) => (
              <button
                type="button"
                role="menuitem"
                className="review-menu__item"
                onClick={() => {
                  close();
                  setConfirming("sweep");
                }}
              >
                Land and discard workspace
              </button>
            )}
          </ReviewMenu>
        </div>
        <button
          type="button"
          className="btn review-actions__github"
          disabled={busy || summary.files === 0 || !githubReady}
          title={githubTitle(githubReady, github)}
          onClick={() => setPrOpen(true)}
        >
          Open pull request
        </button>
        <ReviewMenu
          label="More actions"
          className="icon-btn"
          glyph={<MoreIcon size={15} />}
          disabled={busy}
        >
          {(close) => (
            <button
              type="button"
              role="menuitem"
              className="review-menu__item review-menu__item--danger"
              onClick={() => {
                close();
                setConfirming("discard");
              }}
            >
              Discard workspace…
            </button>
          )}
        </ReviewMenu>
      </div>
      {prOpen && <ReviewPrSheet pane={pane} status={status} onClose={() => setPrOpen(false)} />}
    </footer>
  );
}
