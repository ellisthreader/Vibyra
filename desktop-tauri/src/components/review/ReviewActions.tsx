import { useState } from "react";

import { mergeWarning, summarize } from "../../lib/reviewPolicy";
import { selectionCount } from "../../lib/reviewSelection";
import type { WorktreeStatus } from "../../ipc/review";
import { useReviewStore } from "../../state/reviewStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { PaneState } from "../../state/terminalStoreTypes";
import { ChevronDownIcon, MoreIcon } from "../common/Icons";
import { GithubConnectSheet } from "./GithubConnectSheet";
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
 * Approve is the primary action and the only one at that weight — Reject is an
 * irreversible delete, and a delete sitting beside an approve in the same
 * button shape is a mis-click waiting to happen, so it lives in the overflow
 * and states what it removes before it removes it. Both still pause inline,
 * the account-switch idiom, rather than opening a modal: the sentence appears
 * where the button was, so the thing you were reading and the thing you are
 * agreeing to are in the same place.
 *
 * Share on GitHub is never disabled by readiness: not connected opens the
 * connect walk-through, and the moment a re-check comes back connected the
 * same open state renders the real pull-request sheet instead.
 */
export function ReviewActions({ pane, projectRoot, status }: Props) {
  const busyPane = useReviewStore((state) => state.busyPane);
  const outcome = useReviewStore((state) => state.outcomeByPane[pane.id]);
  const selection = useReviewStore((state) => state.selectionByPane[pane.id]);
  // Keyed by project: a slow probe for the previous project must never
  // enable this project's share button.
  const github = useReviewStore((state) =>
    state.github?.root === projectRoot ? state.github.status : null,
  );
  const merge = useReviewStore((state) => state.merge);
  const discard = useReviewStore((state) => state.discard);
  const activity = useTerminalStore((state) => state.activity[pane.id] ?? "idle");
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const busy = busyPane !== null;
  const summary = summarize(status);
  const count = selectionCount(status, selection);
  const left = summary.files - count;
  const warning = mergeWarning(activity);
  const alive = pane.status === "running";
  const githubReady =
    github !== null && github.ghInstalled && github.authed && github.originGithub;
  const landLabel =
    count === summary.files && count > 1
      ? `Approve all ${count} files`
      : count === 1
        ? "Approve 1 file"
        : `Approve ${count} files`;

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
          Approved — the changes are in your project as ordinary edits. Commit them whenever
          you're ready.
        </p>
      )}
      {outcome && !outcome.applied && outcome.conflicts.length === 0 && (
        <p className="review-outcome review-outcome--stuck">Nothing to approve yet.</p>
      )}
      {outcome && !outcome.applied && outcome.conflicts.length > 0 && (
        <ReviewConflictPanel pane={pane} root={projectRoot} conflicts={outcome.conflicts} />
      )}
      <div className="review-actions__row">
        <div className="review-actions__split">
          <button
            type="button"
            className="btn btn--approve review-actions__land"
            disabled={busy || count === 0}
            onClick={() => void (warning ? setConfirming("merge") : runMerge())}
          >
            {busyPane === pane.id ? "Working…" : landLabel}
          </button>
          <ReviewMenu
            label="More approve options"
            className="btn btn--approve review-actions__caret"
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
                Approve, then remove the workspace
              </button>
            )}
          </ReviewMenu>
        </div>
        <button
          type="button"
          className="btn review-actions__github"
          disabled={busy || summary.files === 0}
          title={githubTitle(githubReady, github)}
          onClick={() => setShareOpen(true)}
        >
          Share on GitHub
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
              Reject — delete this work…
            </button>
          )}
        </ReviewMenu>
      </div>
      {shareOpen &&
        (githubReady ? (
          <ReviewPrSheet pane={pane} status={status} onClose={() => setShareOpen(false)} />
        ) : (
          <GithubConnectSheet
            projectRoot={projectRoot}
            github={github}
            onClose={() => setShareOpen(false)}
          />
        ))}
    </footer>
  );
}
