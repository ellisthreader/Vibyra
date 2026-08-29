import { useState } from "react";

import { discardWorkspace, openReview, type SafeWorkspaceRow as Row } from "./safeWorkspaces";

interface Props {
  row: Row;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * One safe workspace.
 *
 * Discard is a quiet text button and Open review is the ordinary one: nothing
 * here may sit at the weight of a constructive action. It also refuses to act
 * on a single click — the confirm names the folder and the branch it is about
 * to delete, because from this pane the user cannot see either of them.
 */
export function SafeWorkspaceRow({ row, busy, onBusy, onDone, onError }: Props) {
  const [confirming, setConfirming] = useState(false);

  const discard = async () => {
    onBusy(true);
    try {
      await discardWorkspace(row);
      onDone();
    } catch (failure) {
      onError(String(failure));
    } finally {
      onBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="safe-workspace">
      <div className="setting-row__text">
        <span className="setting-row__label">{row.branch}</span>
        <span className="setting-row__hint safe-workspace__path">
          {row.project.name} · {row.path}
        </span>
      </div>
      <span
        className={`settings-status ${row.pane ? "settings-status--success" : "settings-status--warn"}`}
      >
        <i />
        {row.pane ? "Pane attached" : row.exists ? "No pane" : "Folder gone"}
      </span>
      <div className="settings-row-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void openReview(row)}>
          Open review
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy || confirming}
          onClick={() => setConfirming(true)}
        >
          Discard
        </button>
      </div>
      {confirming && (
        <div className="safe-workspace__confirm">
          <p>
            Deletes the folder <code>{row.path}</code> and the branch{" "}
            <code>{row.branch}</code>, with everything in them that has not been landed
            {row.pane ? ", and closes the pane using it" : ""}. This cannot be undone.
          </p>
          <div className="settings-row-actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => void discard()}
            >
              {busy ? "Deleting…" : "Delete workspace"}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
