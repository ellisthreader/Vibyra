import { ChevronIcon } from "../../common/Icons";
import { prTitle } from "../../../lib/reviewPolicy";
import { useReviewStore } from "../../../state/reviewStore";
import { useTerminalStore } from "../../../state/terminalStore";
import type { PaneState } from "../../../state/terminalStoreTypes";

// The changeset's one line of chrome: whose work this is, and the way back.
//
// Back is the only navigation in the panel — a diff opens in place — so it
// stays a single control in a fixed spot. The line leads with the pane's own
// name rather than its branch (Ellis, 2026-08-29: no git words on this
// surface); the branch survives in the tooltip for anyone who wants it. The
// dot is the pane's live activity, because a changeset read while its agent
// is still writing is a moving target, and that fact belongs beside the name.
// The manual refresh icon is gone with the fleet header's: `useReviewWatch`
// refreshes on the working→idle edge, and the mount fetch covers arrival.

const DOT_TITLE: Record<string, string> = {
  working: "Still working — the changes are still growing",
  attention: "Waiting on you in the terminal",
  idle: "Finished — these changes are settled",
};

export function ReviewChangesetHead({ pane }: { pane: PaneState }) {
  const activity = useTerminalStore((state) => state.activity[pane.id] ?? "idle");
  const openFleet = useReviewStore((state) => state.openFleet);

  return (
    <header className="review-back">
      <button type="button" className="review-back__btn" onClick={openFleet}>
        <span className="review-back__chevron" aria-hidden="true">
          <ChevronIcon size={13} />
        </span>
        All agents
      </button>
      <span className={`review-back__dot review-back__dot--${activity}`} title={DOT_TITLE[activity]}>
        <span className="sr-only">{DOT_TITLE[activity]}</span>
      </span>
      <span className="review-back__title" title={pane.workspace?.branch}>
        {prTitle(pane)}
      </span>
    </header>
  );
}
