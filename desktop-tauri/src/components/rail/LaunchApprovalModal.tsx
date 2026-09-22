import { computerName } from "../../lib/platform";
import { useRef, useState } from "react";
import { useLaunchApprovalStore } from "../../state/launchApprovalStore";
import { CloseIcon, FolderIcon, CheckIcon } from "../common/Icons";
import { useDialogFocus } from "../teammates/useDialogFocus";

export function LaunchApprovalModal() {
  const pending = useLaunchApprovalStore((state) => state.pending);
  const clear = useLaunchApprovalStore((state) => state.clear);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const cancel = () => { if (!inFlight.current) clear(); };
  const dialog = useDialogFocus(Boolean(pending), cancel);
  if (!pending) return null;
  const count = pending.workerCount ?? 1;
  const approve = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setError('');
    try { await pending.continueLaunch(); clear(); }
    catch (reason) { setError(String(reason)); }
    finally { inFlight.current = false; setSaving(false); }
  };

  return <div className="modal-backdrop" onClick={cancel}>
    <section ref={node => { dialog.current = node; }} className="modal launch-approval" role="dialog" aria-modal="true"
      aria-labelledby="safe-launch-title" aria-describedby="safe-launch-description" aria-busy={saving} onClick={event => event.stopPropagation()}>
      <header className="launch-approval__header">
        <span className="launch-approval__eyebrow"><CheckIcon size={13} />Safe mode</span>
        <button className="icon-btn" type="button" aria-label="Cancel launch" disabled={saving} onClick={cancel}><CloseIcon size={16} /></button>
      </header>
      <div className="launch-approval__content">
        <h2 id="safe-launch-title">Start in safe mode?</h2>
        <p id="safe-launch-description">Each worker runs a task in its own terminal, with a separate copy of your project.</p>
        <div className="launch-approval__diagram" aria-hidden="true">
          <div className="launch-approval__project"><FolderIcon size={22} /><strong>{pending.projectName}</strong><small>Your files stay here</small></div>
          <span className="launch-approval__connector" />
          <div className="launch-approval__copies">{Array.from({ length: Math.min(count, 3) }, (_, index) =>
            <span key={index}><FolderIcon size={15} />{count > 3 && index === 2 ? `+${count - 2} workers` : `Worker ${index + 1}`}<CheckIcon size={12} /></span>)}</div>
        </div>
        <div className="launch-approval__step"><span>1</span><div><strong>Keep a local checkpoint</strong><p>Save the current state of {pending.changedFiles.toLocaleString()} changed {pending.changedFiles === 1 ? 'file' : 'files'}.</p></div></div>
        <div className="launch-approval__step"><span>2</span><div><strong>Work in separate copies</strong><p>Each worker gets its own folder and branch. Your current files and staged changes stay as they are.</p></div></div>
        <p className="launch-approval__note">The checkpoint stays on this {computerName}. Safe mode separates files; it doesn’t change the AI’s access permissions.</p>
        {error && <p className="launch-approval__error" role="alert">{error}</p>}
      </div>
      <footer className="launch-approval__actions">
        <button className="btn" type="button" disabled={saving} onClick={cancel}>Cancel</button>
        <button className="btn btn--primary" type="button" disabled={saving} onClick={() => void approve()}>{saving ? 'Preparing…' : `Save & start ${count === 1 ? 'worker' : `${count} workers`}`}</button>
      </footer>
    </section>
  </div>;
}
