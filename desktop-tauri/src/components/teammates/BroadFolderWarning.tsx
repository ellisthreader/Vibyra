import { useState } from 'react';
import { breadthWords, type BroadChoice } from './folderBreadth';

/**
 * F-31: the extra, explicit step before a teammate may read a folder that is not one project (the home
 * folder, a disk, Desktop, Documents ...). Nothing is granted until it is confirmed, and the grant is
 * read-only: edits are never offered for such a folder (this build has no shell tests at all).
 */
export function BroadFolderWarning({ choice, busy, onConfirm, onCancel }: { choice: BroadChoice; busy: boolean; onConfirm(): void; onCancel(): void }) {
  const [understood, setUnderstood] = useState(false);
  const words = breadthWords[choice.broad];
  return <div className="agent-worktree-confirm" role="group" aria-label="Broad folder warning">
    <p><strong>{words.title}</strong> {words.detail}</p>
    <p>{choice.path}</p>
    <p>Edits stay off for a folder this broad, so access would be read-only. A single project folder is safer.</p>
    <label><input type="checkbox" checked={understood} disabled={busy} onChange={event => setUnderstood(event.target.checked)} /> I understand. Give read-only access to this folder.</label>
    <button type="button" disabled={busy || !understood} onClick={onConfirm}>Grant read-only access</button>
    <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
  </div>;
}
