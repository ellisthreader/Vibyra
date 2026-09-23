import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { message } from './api';

interface Change { path: string; status: string }
interface Status { files: Change[]; truncated: boolean }

export function AgentWorktreeReview({ id, disabled }: { id: string; disabled: boolean }) {
  const [files, setFiles] = useState<Change[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setBusy(true); setError(''); setSelected(null); setDiff(null);
    try {
      const result = await invoke<Status>('agent_computer_worktree_status', { id });
      setFiles(result.files); setTruncated(result.truncated);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const inspect = async (path: string) => {
    setBusy(true); setError(''); setSelected(path); setDiff(null);
    try {
      const result = await invoke<{ diff: string }>('agent_computer_worktree_diff', { id, path });
      setDiff(result.diff);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const reveal = async () => {
    setError('');
    try { await invoke('agent_computer_reveal_worktree', { id }); }
    catch (cause) { setError(message(cause)); }
  };

  return <div className="agent-worktree-review">
    <button type="button" disabled={disabled || busy} onClick={() => void refresh()}>{files ? 'Refresh changes' : 'Review changes'}</button>
    <button type="button" disabled={disabled || busy} onClick={() => void reveal()}>Show worktree folder</button>
    {error && <p role="alert">{error}</p>}
    {files && (files.length ? <ul>{files.map(file => <li key={file.path}>
      <button type="button" disabled={disabled || busy} aria-pressed={selected === file.path} onClick={() => void inspect(file.path)}>
        <span>{file.status}</span> {file.path}
      </button>
    </li>)}</ul> : <p>No worktree changes yet.</p>)}
    {truncated && <p>Showing the first 50 changed files.</p>}
    {selected && diff && <pre aria-label={`Changes in ${selected}`}>{diff}</pre>}
  </div>;
}
