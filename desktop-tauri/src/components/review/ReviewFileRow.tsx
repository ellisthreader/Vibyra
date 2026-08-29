import { useState } from "react";

import { reviewFileDiff, type ChangedFile } from "../../ipc/review";
import type { SafeWorkspaceRef } from "../../types";
import { ReviewDiffView } from "./ReviewDiffView";
import type { Overlap } from "./changeset/useChangesetOverlaps";

const MARKS: Record<ChangedFile["kind"], string> = {
  added: "+",
  modified: "~",
  deleted: "−",
  renamed: "→",
};

/**
 * Splits a path where the ellipsis should fall.
 *
 * The directory truncates and the filename never does, which is what the old
 * `direction: rtl` was reaching for — but that reordered the text itself, so
 * any path carrying a bidi-neutral character (a bracket, a dash, a quote in a
 * filename) rendered in an order nobody typed. Two spans get the same
 * behaviour out of ordinary left-to-right layout.
 */
function splitPath(path: string): { dir: string; name: string } {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? { dir: "", name: path } : { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}

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
  const { dir, name } = splitPath(file.path);

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
            {dir && <span className="review-file__dir">{dir}</span>}
            <span className="review-file__name">{name}</span>
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
