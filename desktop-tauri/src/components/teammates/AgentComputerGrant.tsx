import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { message } from './api';
import { AgentWorktreeReview } from './AgentWorktreeReview';
import { computerName } from '../../lib/platform';
import { BroadFolderWarning } from './BroadFolderWarning';
import { broadChoice, type BroadChoice } from './folderBreadth';

/** This build's Mac runner has no shell-test VM and no branch publishing (`agent_computer_choose` refuses
 * `allowTests: true`), so the shell-tests checkbox is never offered and `allowTests` is never sent true, whatever
 * the server's roster `vmTests` capability says. Flip this only together with a native runner that can run them. */
const SHELL_TESTS_IN_THIS_BUILD = false;

interface Grant { id: string; agentId: string; label: string; path: string; worktreePath?: string | null; canWrite: boolean; canTest?: boolean; needsReselection?: boolean; revoked: boolean }

export function AgentComputerGrant({ agentId, disabled, vmTests, onChanged }: {
  agentId: string; disabled: boolean; vmTests: boolean; onChanged(): Promise<void>;
}) {
  const shellTests = SHELL_TESTS_IN_THIS_BUILD && vmTests && typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [allowEdits, setAllowEdits] = useState(false);
  const [allowTests, setAllowTests] = useState(false);
  const [broad, setBroad] = useState<BroadChoice | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = (live = () => true) => invoke<Grant[]>('agent_computer_grants').then(items => { if (live()) { const current = items.find(item => item.agentId === agentId) ?? null; setGrant(current); setAllowEdits(current?.canWrite ?? false); setAllowTests(current?.canTest ?? false); } })
    .catch(cause => { if (live()) setError(message(cause)); });
  useEffect(() => { let live = true; void load(() => live); return () => { live = false; }; }, [agentId]);
  // F-31: the Mac grants nothing for home, a disk or a broad parent until `confirm` is sent, and then only read-only.
  const choose = async (confirm = false) => {
    setBusy(true); setError(''); if (!confirm) setBroad(null);
    try {
      const result = await invoke<Grant & { cancelled?: boolean }>('agent_computer_choose', confirm
        ? { agentId, allowEdits: false, allowTests: false, confirmBroad: true }
        : { agentId, allowEdits, allowTests: shellTests && allowEdits && allowTests });
      if (result.cancelled) return;
      const asked = broadChoice(result);
      if (asked) { setBroad(asked); return; }
      setBroad(null); setGrant(result); setAllowEdits(result.canWrite); setAllowTests(result.canTest ?? false); await onChanged();
    } catch (cause) { setBroad(null); setError(message(cause)); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!grant) return;
    setBusy(true); setError('');
    try { await invoke('agent_computer_revoke', { id: grant.id }); setGrant(null); await onChanged(); }
    catch (cause) { setGrant({ ...grant, revoked: true }); setError(message(cause)); }
    finally { setBusy(false); }
  };
  const discard = async () => {
    if (!grant) return;
    setError('');
    try { await invoke('agent_computer_revoke', { id: grant.id, discardWorktree: true }); setGrant(null); await onChanged(); }
    catch (cause) { setError(message(cause)); await load(); }
  };
  return <section className="teammate-computer-grant" aria-label="Agent Computer">
    <h3>Agent Computer</h3>
    <p>Choose one folder this teammate may inspect. Its contents can be sent to the AI model. Keep this {computerName} open for computer tasks.</p>
    <label><input type="checkbox" checked={allowEdits && !broad} disabled={disabled || busy || !!broad} onChange={event => { setAllowEdits(event.target.checked); if (!event.target.checked) setAllowTests(false); }} /> Allow proposed file edits. Every edit still asks for your exact approval. A clean Git repository gets a separate worktree; other folders are edited directly.</label>
    {shellTests && allowEdits && !broad && <label><input type="checkbox" checked={allowTests} disabled={disabled || busy} onChange={event => setAllowTests(event.target.checked)} /> Allow proposed shell tests in a disconnected Linux VM. This requires a clean Git repository and a separate worktree. Every test asks for approval of its exact script and files.</label>}
    {grant && <p>{grant.revoked ? 'Local access is off. Cloud removal needs a retry.' : grant.needsReselection ? `Choose this folder again to restore project access under the current ${computerName} safety rules.` : <><strong>{grant.canWrite ? 'Edit source:' : 'Read-only folder:'}</strong> {grant.path}{grant.worktreePath && <> <strong>Agent worktree:</strong> {grant.worktreePath} Review its edits, then apply them to your project as uncommitted changes or discard the worktree. Removing access alone leaves this folder on your {computerName}.</>}{grant.canTest && <> {shellTests ? 'Shell tests allowed with separate approval.' : 'Shell tests are unavailable on this computer. Choose the folder again to update access.'}</>}</>}</p>}
    {broad && <BroadFolderWarning key={broad.path} choice={broad} busy={disabled || busy} onConfirm={() => void choose(true)} onCancel={() => setBroad(null)} />}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={disabled || busy} onClick={() => void choose()}>{grant && !grant.revoked ? 'Change folder or access' : 'Choose folder'}</button>
    {grant?.worktreePath && !grant.revoked && <AgentWorktreeReview key={grant.id} id={grant.id} disabled={disabled || busy} onDiscard={discard} />}
    {grant && <button type="button" disabled={disabled || busy} onClick={() => void revoke()}>{grant.revoked ? 'Retry cloud removal' : 'Remove access'}</button>}
  </section>;
}
