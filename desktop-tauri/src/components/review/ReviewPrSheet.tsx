import { useEffect, useRef, useState } from "react";

import { githubCreatePr, githubListBranches, type RepoBranches } from "../../ipc/github";
import { prBody, prTitle } from "../../lib/reviewPolicy";
import type { WorktreeStatus } from "../../ipc/review";
import { useModalFocus } from "../../lib/useModalFocus";
import type { PaneState } from "../../state/terminalStoreTypes";
import { GitBranchIcon } from "../common/Icons";
import { ReviewPrStatus } from "./ReviewPrStatus";

interface Props {
  pane: PaneState;
  status: WorktreeStatus | null;
  onClose: () => void;
}

/**
 * Push the safe-mode branch and open a pull request, through `gh` — GitHub
 * auth never passes through Vibyra. Title and body arrive prefilled: the
 * conversation already named itself, and the changeset writes its own manifest.
 *
 * The base branch is a choice rather than an assumption. `gh` targets the
 * repository default when nothing says otherwise, which is the wrong target
 * whenever the agent was launched from a feature branch — the PR then proposes
 * the feature's whole history and nobody can review it.
 */
export function ReviewPrSheet({ pane, status, onClose }: Props) {
  const worktree = pane.workspace?.path ?? "";
  const branch = pane.workspace?.branch ?? "";
  const [title, setTitle] = useState(() => prTitle(pane));
  const [body, setBody] = useState(() => prBody(status, branch));
  const [bases, setBases] = useState<RepoBranches | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  // While the commit/push/PR run, the sheet is the only thing showing them.
  // Escape and a backdrop click must not dismiss it mid-flight — the native
  // work would keep going invisibly.
  const closeUnlessBusy = () => {
    if (!busy) onClose();
  };
  useModalFocus(modalRef, true, closeUnlessBusy);

  // One fetch when the sheet opens. A branch list changes on the scale of
  // somebody creating a branch, and a failure here is a degraded picker — the
  // PR still opens against the repository default, exactly as it used to.
  useEffect(() => {
    if (!worktree) return;
    let cancelled = false;
    void githubListBranches(worktree)
      .then((next) => {
        if (cancelled) return;
        setBases(next);
        setBase(next.defaultBranch);
      })
      .catch(() => {
        if (!cancelled) setBases({ defaultBranch: null, names: [], truncated: false });
      });
    return () => {
      cancelled = true;
    };
  }, [worktree]);

  const submit = async () => {
    if (busy || !worktree || title.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setUrl(await githubCreatePr(worktree, title.trim(), body, base));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };

  const names = bases?.names ?? [];

  return (
    <div className="modal-backdrop" onClick={closeUnlessBusy}>
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
              <span>Base branch{bases?.truncated ? " — first 100" : ""}</span>
              <select
                className="input"
                value={base ?? ""}
                disabled={names.length === 0}
                onChange={(event) => setBase(event.target.value || null)}
              >
                {names.length === 0 ? (
                  <option value="">
                    {bases === null ? "Loading branches…" : "Repository default"}
                  </option>
                ) : (
                  names.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="review-pr__field">
              <span>Description</span>
              <textarea
                rows={6}
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
          <ReviewPrStatus worktree={worktree} url={url} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
