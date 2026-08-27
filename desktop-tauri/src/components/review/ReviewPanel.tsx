import { useEffect, useState } from "react";

import { reviewablePanes, summarize } from "../../lib/reviewPolicy";
import { useReviewStore } from "../../state/reviewStore";
import { useTerminalStore } from "../../state/terminalStore";
import { GitBranchIcon, RestartIcon } from "../common/Icons";
import { ReviewActions } from "./ReviewActions";
import { ReviewFileRow } from "./ReviewFileRow";

interface Props {
  projectId: string;
  root: string;
}

/**
 * The Review dock tool: what a safe-mode agent changed, and the two ways the
 * review ends — the changes come into the project, or the worktree goes.
 *
 * One pane at a time. A review is a reading moment, not a dashboard: the
 * selector picks the terminal, everything below is that terminal's changeset.
 */
export function ReviewPanel({ projectId, root }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const panes = useTerminalStore((state) => state.panes);
  const focusedId = useTerminalStore((state) => state.focusedId);
  const selectedPane = useReviewStore((state) => state.selectedPane);
  const statusByPane = useReviewStore((state) => state.statusByPane);
  const loadingPane = useReviewStore((state) => state.loadingPane);
  const select = useReviewStore((state) => state.select);
  const refresh = useReviewStore((state) => state.refresh);
  const refreshGithub = useReviewStore((state) => state.refreshGithub);

  const reviewable = reviewablePanes(panes, projectId);
  const pane =
    reviewable.find((candidate) => candidate.id === selectedPane) ??
    reviewable.find((candidate) => candidate.id === focusedId) ??
    reviewable[0] ??
    null;
  const status = pane ? (statusByPane[pane.id] ?? null) : null;
  const selectedFile = status?.changed.find((file) => file.path === selectedPath) ?? null;
  const summary = summarize(status);

  useEffect(() => setSelectedPath(null), [pane?.id]);

  useEffect(() => {
    if (pane) void refresh(pane);
    // Refresh keys off identity, not the object: panes re-render often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane?.id, pane?.workspace?.path]);

  useEffect(() => {
    void refreshGithub(root);
  }, [root, refreshGithub]);

  if (!pane) {
    return (
      <div className="companion-panel companion-panel--review">
        <div className="review-empty">
          <GitBranchIcon size={22} />
          <h3>Nothing to review</h3>
          <p>
            Terminals launched with <strong>Safe mode</strong> work in their own copy of the
            project. Their changes show up here for you to review, bring in, or discard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="companion-panel companion-panel--review">
      {reviewable.length > 1 && (
        <div className="review-picker" role="tablist" aria-label="Terminal to review">
          {reviewable.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === pane.id}
              className={`review-picker__chip ${candidate.id === pane.id ? "review-picker__chip--on" : ""}`}
              onClick={() => select(candidate.id)}
            >
              {candidate.customTitle || candidate.chatTitle || candidate.title}
            </button>
          ))}
        </div>
      )}

      <header className="review-head">
        <span className="review-head__branch" title={pane.workspace?.branch}>
          <GitBranchIcon size={13} />
          <code>{pane.workspace?.branch}</code>
        </span>
        <span className="review-head__stats">
          {summary.files === 1 ? "1 file" : `${summary.files} files`}
          <em className="review-add">+{summary.additions}</em>
          <em className="review-del">−{summary.deletions}</em>
        </span>
        <button
          type="button"
          className="icon-btn"
          title="Refresh changes"
          disabled={loadingPane === pane.id}
          onClick={() => void refresh(pane)}
        >
          <RestartIcon size={13} />
        </button>
      </header>

      <div className="review-scroll">
        {status === null ? (
          <p className="review-note">Reading changes…</p>
        ) : status.changed.length === 0 ? (
          <p className="review-note">
            No changes yet. Everything the agent edits in its safe workspace will be listed here.
          </p>
        ) : (
          <div className="review-list" role="list">
            {status.changed.map((file) => (
              <ReviewFileRow
                key={file.path}
                workspace={pane.workspace!}
                file={file}
                selected={file.path === selectedFile?.path}
                onSelect={() => setSelectedPath((path) => path === file.path ? null : file.path)}
              />
            ))}
            {status.truncated && (
              <p className="review-note">The list stops at 2,000 files — the rest are still in the workspace.</p>
            )}
          </div>
        )}
      </div>

      <ReviewActions
        pane={pane}
        projectRoot={root}
        status={status}
        selectedFile={selectedFile}
        onRejected={() => setSelectedPath(null)}
      />
    </div>
  );
}
