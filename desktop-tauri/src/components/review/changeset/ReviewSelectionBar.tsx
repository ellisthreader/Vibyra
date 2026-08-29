import type { ChangedFile, WorktreeStatus } from "../../../ipc/review";
import { isEverything, isSelected, type FileSelection } from "../../../lib/reviewSelection";
import { useReviewStore } from "../../../state/reviewStore";

// The tally, and the two ways to move the whole selection at once.
//
// The counts are the *selection's*, not the changeset's: a bar that keeps
// reading "+340 −22" while eight files sit unticked is describing a land that
// is no longer the one the button would run.

interface Props {
  paneId: number;
  status: WorktreeStatus | null;
  selection: FileSelection;
}

function totals(files: ChangedFile[]): { additions: number; deletions: number } {
  return files.reduce(
    (sum, file) => ({
      additions: sum.additions + file.additions,
      deletions: sum.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

export function ReviewSelectionBar({ paneId, status, selection }: Props) {
  const setSelection = useReviewStore((state) => state.setSelection);
  const changed = status?.changed ?? [];
  const picked = changed.filter((file) => isSelected(selection, file.path));
  const { additions, deletions } = totals(picked);
  const noun = changed.length === 1 ? "file" : "files";

  return (
    <div className="review-tally">
      <span className="review-tally__count" aria-live="polite">
        {/* Always "n of m", even at full: the bar's job is to say what this
            land takes, and a bare "12 files" reads as the changeset instead. */}
        {`${picked.length} of ${changed.length} ${noun}`}
      </span>
      <span className="review-tally__stats">
        <em className="review-add">+{additions}</em>
        <em className="review-del">−{deletions}</em>
      </span>
      <div className="review-tally__acts">
        <button
          type="button"
          className="review-tally__act"
          // `undefined` rather than a list of every current path: see
          // `reviewSelection`. Select all has to keep covering the files the
          // agent writes next, or the tick means less than it appears to.
          disabled={isEverything(selection)}
          onClick={() => setSelection(paneId, undefined)}
        >
          Select all
        </button>
        <button
          type="button"
          className="review-tally__act"
          disabled={picked.length === 0}
          onClick={() => setSelection(paneId, [])}
        >
          None
        </button>
      </div>
    </div>
  );
}
