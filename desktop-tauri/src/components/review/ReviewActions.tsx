import { useState } from "react";

import { discardCopy, mergeWarning, summarize } from "../../lib/reviewPolicy";
import type { WorktreeStatus } from "../../ipc/review";
import { useReviewStore } from "../../state/reviewStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { PaneState } from "../../state/terminalStoreTypes";
import { ReviewPrSheet } from "./ReviewPrSheet";

interface Props {
  pane: PaneState;
  projectRoot: string;
  status: WorktreeStatus | null;
}

/**
 * How a review ends. Merge and discard both act on the user's project, so
 * each pauses once — inline, the account-switch idiom — before doing it.
 * The GitHub action mounts here too: the branch is sitting ready to push.
 */
export function ReviewActions({ pane, projectRoot, status }: Props) {
  const busyPane = useReviewStore((state) => state.busyPane);
  const outcome = useReviewStore((state) => state.outcomeByPane[pane.id]);
  const github = useReviewStore((state) => state.github);
  const merge = useReviewStore((state) => state.merge);
  const discard = useReviewStore((state) => state.discard);
  const activity = useTerminalStore((state) => state.activity[pane.id] ?? "idle");
  const [confirming, setConfirming] = useState<"merge" | "discard" | null>(null);
  const [prOpen, setPrOpen] = useState(false);

  const busy = busyPane !== null;
  const summary = summarize(status);
  const empty = summary.files === 0;
  const warning = mergeWarning(activity);
  const githubReady = github !== null && github.ghInstalled && github.authed && github.origin !== null;

  const runMerge = async () => {
    setConfirming(null);
    await merge(pane, projectRoot);
  };

  if (confirming) {
    const isMerge = confirming === "merge";
    return (
      <footer className="review-actions review-actions--confirm">
        <em>{isMerge ? warning : discardCopy(summary, pane.status === "running")}</em>
        <div className="review-actions__row">
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(null)}>
            Wait
          </button>
          <button
            type="button"
            className={`btn ${isMerge ? "btn--primary" : "btn--danger"}`}
            disabled={busy}
            onClick={() => void (isMerge ? runMerge() : discard(pane, projectRoot))}
          >
            {isMerge ? "Merge anyway" : "Discard everything"}
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="review-actions">
      {outcome && (
        <p className={`review-outcome ${outcome.applied ? "review-outcome--ok" : "review-outcome--stuck"}`}>
          {outcome.applied
            ? "Changes are in your project as ordinary edits — commit them when you're ready."
            : outcome.conflicts.length > 0
              ? `Not merged — your project has its own changes in: ${outcome.conflicts.join(", ")}. Nothing was touched.`
              : "Nothing to merge yet."}
        </p>
      )}
      <div className="review-actions__row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || empty}
          onClick={() => void (warning ? setConfirming("merge") : runMerge())}
        >
          {busyPane === pane.id ? "Working…" : "Bring into project"}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setConfirming("discard")}>
          Discard
        </button>
        <button
          type="button"
          className="btn review-actions__github"
          disabled={busy || empty || !githubReady}
          title={
            githubReady
              ? "Push this branch and open a pull request"
              : github === null || !github.ghInstalled
                ? "Needs the GitHub CLI (gh) installed"
                : !github.authed
                  ? "Sign in first: run `gh auth login` in a terminal"
                  : "This project has no GitHub remote"
          }
          onClick={() => setPrOpen(true)}
        >
          Open pull request
        </button>
      </div>
      {prOpen && <ReviewPrSheet pane={pane} status={status} onClose={() => setPrOpen(false)} />}
    </footer>
  );
}
