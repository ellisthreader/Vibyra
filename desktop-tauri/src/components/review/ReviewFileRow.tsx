import { useState } from "react";

import { reviewFileDiff, type ChangedFile } from "../../ipc/review";
import type { SafeWorkspaceRef } from "../../types";
import { ReviewDiffView } from "./ReviewDiffView";

const MARKS: Record<ChangedFile["kind"], string> = {
  added: "+",
  modified: "~",
  deleted: "−",
  renamed: "→",
};

/**
 * One changed file: kind, path, counts — and its diff, fetched the first time
 * the row is opened rather than for the whole list up front.
 */
export function ReviewFileRow({
  workspace,
  file,
  selected,
  onSelect,
}: {
  workspace: SafeWorkspaceRef;
  file: ChangedFile;
  selected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    onSelect();
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
      <button
        type="button"
        className={`review-file__row${selected ? " review-file__row--selected" : ""}`}
        aria-expanded={open}
        aria-pressed={selected}
        onClick={() => void toggle()}
      >
        <span className={`review-file__mark review-file__mark--${file.kind}`} aria-hidden="true">
          {MARKS[file.kind]}
        </span>
        <code className="review-file__path" title={file.path}>
          {file.path}
        </code>
        <span className="review-file__stats">
          {file.additions > 0 && <em className="review-add">+{file.additions}</em>}
          {file.deletions > 0 && <em className="review-del">−{file.deletions}</em>}
        </span>
      </button>
      {open && (diff === null ? <p className="review-note">Reading diff…</p> : <ReviewDiffView diff={diff} />)}
    </div>
  );
}
