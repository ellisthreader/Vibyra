import { useRef, useState } from "react";

import { githubCreatePr, githubOpenPr } from "../../ipc/github";
import { prBody, prTitle } from "../../lib/reviewPolicy";
import type { WorktreeStatus } from "../../ipc/review";
import { useModalFocus } from "../../lib/useModalFocus";
import type { PaneState } from "../../state/terminalStoreTypes";
import { GitBranchIcon } from "../common/Icons";

interface Props {
  pane: PaneState;
  status: WorktreeStatus | null;
  onClose: () => void;
}

/**
 * Push the safe-mode branch and open a pull request, through `gh` — GitHub
 * auth never passes through Vibyra. Title and body arrive prefilled: the
 * conversation already named itself, and the changeset writes its own manifest.
 */
export function ReviewPrSheet({ pane, status, onClose }: Props) {
  const branch = pane.workspace?.branch ?? "";
  const [title, setTitle] = useState(() => prTitle(pane));
  const [body, setBody] = useState(() => prBody(status, branch));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef, true, onClose);

  const submit = async () => {
    const worktree = pane.workspace?.path;
    if (busy || !worktree || title.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setUrl(await githubCreatePr(worktree, title.trim(), body));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal review-pr"
        role="dialog"
        aria-modal="true"
        aria-label="Open a pull request"
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="review-pr__head">
          <h2>Open a pull request</h2>
          <span className="review-pr__branch">
            <GitBranchIcon size={12} />
            <code>{branch}</code>
          </span>
        </header>

        {url === null ? (
          <>
            <label className="review-pr__field">
              <span>Title</span>
              <input
                value={title}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="review-pr__field">
              <span>Description</span>
              <textarea
                rows={7}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            {error && (
              <p className="review-pr__error" role="alert">
                {error}
              </p>
            )}
            <footer className="review-pr__foot">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || title.trim().length === 0}
                onClick={() => void submit()}
              >
                {busy ? "Pushing…" : "Push branch & open PR"}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={onClose}>
                Cancel
              </button>
            </footer>
          </>
        ) : (
          <>
            <p className="review-pr__done">
              Pull request opened. <code>{url}</code>
            </p>
            <footer className="review-pr__foot">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void githubOpenPr(url)}
              >
                Open on GitHub
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Done
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
