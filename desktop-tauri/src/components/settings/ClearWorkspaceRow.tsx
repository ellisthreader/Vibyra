import { computerName } from "../../lib/platform";
import { useState } from "react";

import { clearTerminalSession } from "../../ipc/session";
import { StatusChip } from "./SettingsControls";
import { SettingRow } from "./SettingsShared";

/**
 * Deletes the saved workspace file: the pane layout, the folders each terminal
 * was opened in, and any stored output.
 *
 * Deliberately not destructive to anything live — running terminals, projects
 * and settings are untouched, and the file is written again the next time the
 * workspace is saved. What it clears is the copy resting on disk between runs,
 * which is the only part a shared or handed-on Mac would expose.
 */
export function ClearWorkspaceRow() {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);

  const clear = async () => {
    setBusy(true);
    setConfirm(false);
    try {
      await clearTerminalSession();
      setCleared(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingRow
      label="Saved workspace"
      hint={
        confirm
          ? `The saved layout, the folders each terminal was opened in and any stored output are deleted from this ${computerName}. Open terminals keep running.`
          : `The pane layout and folders Vibyra reopens with are kept on this ${computerName} between runs. Clearing it does not close anything you have open.`
      }
    >
      {cleared && !confirm ? <StatusChip tone="on">Cleared</StatusChip> : null}
      {confirm ? (
        <>
          <button className="btn btn--compact" onClick={() => setConfirm(false)}>
            Keep
          </button>
          <button className="btn btn--compact btn--danger" disabled={busy} onClick={() => void clear()}>
            Clear
          </button>
        </>
      ) : (
        <button className="btn btn--compact" disabled={busy} onClick={() => { setCleared(false); setConfirm(true); }}>
          Clear
        </button>
      )}
    </SettingRow>
  );
}
