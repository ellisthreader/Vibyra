import { useState } from "react";

import { useLaunchApprovalStore } from "../../state/launchApprovalStore";
import { CloseIcon } from "../common/Icons";

export function LaunchApprovalModal() {
  const pending = useLaunchApprovalStore((state) => state.pending);
  const clear = useLaunchApprovalStore((state) => state.clear);
  const [saving, setSaving] = useState(false);

  if (!pending) return null;
  const changed = `${pending.changedFiles} changed file${pending.changedFiles === 1 ? "" : "s"}`;
  const cancel = () => {
    if (!saving) clear();
  };

  const approve = async () => {
    if (saving) return;
    setSaving(true);
    await pending.continueLaunch();
    clear();
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <section className="modal launch-approval" role="dialog" aria-modal="true" aria-labelledby="safe-launch-title" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title" id="safe-launch-title">Save a local checkpoint?</h2>
            <p className="modal__subtitle">Safe mode found {changed} in {pending.projectName}</p>
          </div>
          <button className="icon-btn" type="button" title="Cancel" disabled={saving} onClick={cancel}>
            <CloseIcon size={15} />
          </button>
        </header>
        <div className="launch-approval__body">
          <span className="launch-approval__mark" aria-hidden="true">✓</span>
          <div>
            <strong>Your current work stays exactly where it is.</strong>
            <p>Vibyra will make a private local checkpoint, then open each terminal on its own branch. Nothing is uploaded and your active branch or staging area will not change.</p>
          </div>
        </div>
        <footer className="launch-approval__actions">
          <button className="btn" type="button" disabled={saving} onClick={cancel}>Cancel</button>
          <button className="btn btn--primary" type="button" disabled={saving} onClick={() => void approve()}>
            {saving ? "Saving checkpoint…" : "Save checkpoint and continue"}
          </button>
        </footer>
      </section>
    </div>
  );
}
