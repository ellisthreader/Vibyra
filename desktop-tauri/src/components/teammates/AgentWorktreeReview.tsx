import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { message } from './api';
import { applyBlocker, applySummary, type ApplyResult, type ReviewSnapshot } from './worktreeApply';

interface Change { path: string; status: string }
interface Status { files: Change[]; truncated: boolean; publishSnapshot?: ReviewSnapshot }

export function AgentWorktreeReview({ id, disabled, onDiscard }: { id: string; disabled: boolean; onDiscard(): Promise<void> }) {
  const [files, setFiles] = useState<Change[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setBusy(true); setError(''); setSelected(null); setDiff(null); setResult(null);
    try {
      const status = await invoke<Status>('agent_computer_worktree_status', { id });
      setFiles(status.files); setTruncated(status.truncated); setSnapshot(status.publishSnapshot);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const inspect = async (path: string) => {
    setBusy(true); setError(''); setSelected(path); setDiff(null);
    try {
      const change = await invoke<{ diff: string }>('agent_computer_worktree_diff', { id, path });
      setDiff(change.diff);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const reveal = async () => {
    setError('');
    try { await invoke('agent_computer_reveal_worktree', { id }); }
    catch (cause) { setError(message(cause)); }
  };
  const apply = async () => {
    if (!snapshot?.snapshotSha256) return;
    setBusy(true); setError(''); setResult(null);
    try { setResult(await invoke<ApplyResult>('agent_computer_worktree_apply', { id, snapshot: snapshot.snapshotSha256 })); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const discard = async () => {
    setBusy(true); setError('');
    try { await onDiscard(); }
    finally { setBusy(false); setConfirming(false); }
  };

  const blocker = files ? applyBlocker(files.length, snapshot) : '';
  const locked = disabled || busy;
  return <div className="agent-worktree-review">
    <button type="button" disabled={locked} onClick={() => void refresh()}>{files ? 'Refresh changes' : 'Review changes'}</button>
    <button type="button" disabled={locked} onClick={() => void reveal()}>Show worktree folder</button>
    {error && <p role="alert">{error}</p>}
    {files && (files.length ? <ul>{files.map(file => <li key={file.path}>
      <button type="button" disabled={locked} aria-pressed={selected === file.path} onClick={() => void inspect(file.path)}>
        <span>{file.status}</span> {file.path}
      </button>
    </li>)}</ul> : <p>No worktree changes yet.</p>)}
    {truncated && <p>Showing the first 50 changed files.</p>}
    {selected && diff && <pre aria-label={`Changes in ${selected}`}>{diff}</pre>}
    {files && files.length > 0 && <div className="agent-worktree-actions">
      <button type="button" disabled={locked || !!blocker} onClick={() => void apply()}>Apply to project</button>
      <button type="button" disabled={locked} onClick={() => setConfirming(true)}>Discard worktree</button>
      {blocker && <p>{blocker}</p>}
      {!blocker && !result && <p>Apply copies exactly the reviewed files into your project as uncommitted changes. Files you changed there are never overwritten.</p>}
    </div>}
    {result && <div className="agent-worktree-result" role="status" data-applied={result.applied}>
      <p>{applySummary(result)}</p>
      {result.conflicts.length > 0 && <ul>{result.conflicts.map(conflict => <li key={conflict.path}><strong>{conflict.path}</strong> {conflict.reason}</li>)}</ul>}
    </div>}
    {confirming && <div className="agent-worktree-confirm" role="group" aria-label="Discard Agent worktree">
      <p>Delete this Agent worktree and every edit you have not applied? This also ends this teammate&apos;s edit access; choose the folder again to start fresh. Your project folder is not changed.</p>
      <button type="button" className="danger" disabled={locked} onClick={() => void discard()}>Delete worktree</button>
      <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
    </div>}
  </div>;
}
