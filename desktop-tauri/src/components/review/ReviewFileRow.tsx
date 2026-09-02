import { useState } from "react";

import { reviewFileDiff, type ChangedFile } from "../../ipc/review";
import { splitPath } from "../../lib/reviewFilePath";
import type { SafeWorkspaceRef } from "../../types";
import { ReviewDiffView } from "./ReviewDiffView";
import type { Overlap } from "./changeset/useChangesetOverlaps";

// Words, not git letter codes: `A`/`M`/`D` mean nothing to someone who has
// never staged a commit, and the chip is wide enough to just say it.
const MARKS: Record<ChangedFile["kind"], string> = {
  added: "new",
  modified: "edit",
  deleted: "gone",
  renamed: "moved",
};

interface Props {
  workspace: SafeWorkspaceRef;
  file: ChangedFile;
  /** Ticked files are the ones a land takes; everything starts ticked. */
  selected: boolean;
  onToggle: () => void;
  /** Set when another live workspace is holding this same file. */
  overlap?: Overlap;
}

/**
 * One changed file: a tick, its kind, path and counts — and its diff, fetched
 * the first time the row is opened rather than for the whole list up front.
 *
 * The checkbox is a real input beside the disclosure rather than inside it: a
 * control nested in a button is neither reachable by keyboard nor announced,
 * and this one decides what lands in the user's project.
 */
export function ReviewFileRow({ workspace, file, selected, onToggle, overlap }: Props) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const { folder, name } = splitPath(file.path);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && diff === null) {
      try {
        setDiff(await reviewFileDiff(workspace, file.path));
      } catch (error) {
        setDiff(`Could not read this diff: ${String(error)}`);
      }
    }
  };

  return (
    <div className="review-file" role="listitem">
      <div className="review-file__head">
        <input
          type="checkbox"
          className="review-file__check"
          checked={selected}
          onChange={onToggle}
          aria-label={`Include ${file.path}`}
        />
        <button
          type="button"
          className="review-file__row"
          aria-expanded={open}
          onClick={() => void toggle()}
        >
          <span className={`review-file__mark review-file__mark--${file.kind}`} aria-hidden="true">
            {MARKS[file.kind]}
          </span>
          <code className="review-file__path" title={file.path}>
            <span className="review-file__name">{name}</span>
            {folder && <span className="review-file__dir">{folder}</span>}
          </code>
          <span className="review-file__stats">
            {overlap && (
              <span
                className={`review-file__pip review-file__pip--${overlap.level}`}
                title={`Also changed by ${overlap.others.join(", ")}`}
              >
                <span className="sr-only">{`Also changed by ${overlap.others.join(", ")}`}</span>
              </span>
            )}
            {file.additions > 0 && <em className="review-add">+{file.additions}</em>}
            {file.deletions > 0 && <em className="review-del">−{file.deletions}</em>}
          </span>
        </button>
      </div>
      {open && (diff === null ? <p className="review-note">Reading diff…</p> : <ReviewDiffView diff={diff} />)}
    </div>
  );
}
