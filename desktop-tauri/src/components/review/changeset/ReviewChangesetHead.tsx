import { GitBranchIcon, ChevronIcon, RestartIcon } from "../../common/Icons";
import { useReviewStore } from "../../../state/reviewStore";
import { useTerminalStore } from "../../../state/terminalStore";
import type { PaneState } from "../../../state/terminalStoreTypes";

// The changeset's one line of chrome: where you are, and the way back.
//
// Back is the only navigation in the panel — a diff opens in place — so it
// stays a single control in a fixed spot rather than moving with the content
// under it. The dot is the pane's own activity, not a review state: a
// changeset read while its agent is still writing is a moving target, and
// that fact belongs beside the branch rather than in a warning nobody reads.

const DOT_TITLE: Record<string, string> = {
  working: "Still working — the changeset is still growing",
  attention: "Waiting on you in the terminal",
  idle: "Idle — this changeset is settled",
};

export function ReviewChangesetHead({ pane }: { pane: PaneState }) {
  const activity = useTerminalStore((state) => state.activity[pane.id] ?? "idle");
  const loading = useReviewStore((state) => state.loadingPane === pane.id);
  const openFleet = useReviewStore((state) => state.openFleet);
  const refresh = useReviewStore((state) => state.refresh);

  return (
    <header className="review-back">
      <button type="button" className="review-back__btn" onClick={openFleet}>
        <span className="review-back__chevron" aria-hidden="true">
          <ChevronIcon size={13} />
        </span>
        Fleet
      </button>
      <span className={`review-back__dot review-back__dot--${activity}`} title={DOT_TITLE[activity]}>
        <span className="sr-only">{DOT_TITLE[activity]}</span>
      </span>
      <span className="review-back__branch" title={pane.workspace?.branch}>
        <GitBranchIcon size={13} />
        <code>{pane.workspace?.branch}</code>
      </span>
      <button
        type="button"
        className="icon-btn"
        title="Refresh changes"
        aria-label="Refresh changes"
        disabled={loading}
        onClick={() => void refresh(pane)}
      >
        <RestartIcon size={13} />
      </button>
    </header>
  );
}
