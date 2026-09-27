import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { message } from './api';
import { AgentWorktreeReview } from './AgentWorktreeReview';
import { computerName } from '../../lib/platform';

interface Grant { id: string; agentId: string; label: string; path: string; worktreePath?: string | null; canWrite: boolean; needsReselection?: boolean; revoked: boolean }

export function AgentComputerGrant({ agentId, disabled, onChanged }: {
  agentId: string; disabled: boolean; onChanged(): Promise<void>;
}) {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [allowEdits, setAllowEdits] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let live = true;
    void invoke<Grant[]>('agent_computer_grants').then(items => { if (live) { const current = items.find(item => item.agentId === agentId) ?? null; setGrant(current); setAllowEdits(current?.canWrite ?? false); } })
      .catch(cause => { if (live) setError(message(cause)); });
    return () => { live = false; };
  }, [agentId]);
  const choose = async () => {
    setBusy(true); setError('');
    try {
      const result = await invoke<Grant & { cancelled?: boolean }>('agent_computer_choose', { agentId, allowEdits });
      if (result.cancelled) return;
      setGrant(result); await onChanged();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!grant) return;
    setBusy(true); setError('');
    try { await invoke('agent_computer_revoke', { id: grant.id }); setGrant(null); await onChanged(); }
    catch (cause) { setGrant({ ...grant, revoked: true }); setError(message(cause)); }
    finally { setBusy(false); }
  };
  return <section className="teammate-computer-grant" aria-label="Agent Computer">
    <h3>Agent Computer</h3>
    <p>Choose one folder this teammate may inspect. Its contents can be sent to the AI model. Keep this {computerName} open for computer tasks.</p>
    <label><input type="checkbox" checked={allowEdits} disabled={disabled || busy} onChange={event => setAllowEdits(event.target.checked)} /> Allow proposed file edits. Every edit still asks for your exact approval. A clean Git repository gets a separate worktree; other folders are edited directly.</label>
    {grant && <p>{grant.revoked ? 'Local access is off. Cloud removal needs a retry.' : grant.needsReselection ? `Choose this folder again to restore edit access under the current ${computerName} safety rules.` : <><strong>{grant.canWrite ? 'Edit source:' : 'Read-only folder:'}</strong> {grant.path}{grant.worktreePath && <> <strong>Agent worktree:</strong> {grant.worktreePath} Review edits there before applying them to your project. Removing access leaves this folder on your {computerName}.</>}</>}</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={disabled || busy} onClick={() => void choose()}>{grant && !grant.revoked ? 'Change folder or access' : 'Choose folder'}</button>
    {grant?.worktreePath && !grant.revoked && <AgentWorktreeReview key={grant.id} id={grant.id} disabled={disabled || busy} />}
    {grant && <button type="button" disabled={disabled || busy} onClick={() => void revoke()}>{grant.revoked ? 'Retry cloud removal' : 'Remove access'}</button>}
  </section>;
}
