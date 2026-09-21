import { useEffect, useState } from 'react';
import { useFilesRoot } from './useFilesRoot';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { FileTree } from '../rail/FileTree';
import { ChevronIcon, FileIcon } from '../common/Icons';
import './filesPanel.css';

interface ChangedFile { path: string; status: string; previousPath: string | null }
interface Changes { root: string; files: ChangedFile[] }
const label = (status: string) => status === '??' ? 'New' : status.includes('U') || ['AA', 'DD'].includes(status) ? 'Conflict'
  : status.includes('R') ? 'Renamed' : status.includes('D') ? 'Deleted' : status.includes('A') ? 'Added' : 'Modified';

export function FilesPanel() {
  const { root, error: rootError, title } = useFilesRoot();
  const version = useWorkspaceStore(s => s.fsVersion);
  const [mode, setMode] = useState<'changes' | 'all'>('changes');
  const [changes, setChanges] = useState<Changes | null>(null);
  const [error, setError] = useState('');
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => { setChanges(null); setPath(null); setError(''); }, [root]);
  useEffect(() => {
    if (!root) return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await invoke<Changes>('fs_changes', { root });
        if (alive) { setChanges(next); setError(''); setRevision(n => n + 1); }
      } catch (error) { if (alive) setError(String(error)); }
      if (alive) timer = setTimeout(refresh, 3000);
    };
    void refresh();
    return () => { alive = false; clearTimeout(timer); };
  }, [root, version]);
  useEffect(() => {
    if (!root || !path || mode !== 'changes') { setPreview(''); return; }
    let alive = true;
    void invoke<string>('fs_change_preview', { root, path }).then(value => { if (alive) setPreview(value); })
      .catch(error => { if (alive) setPreview(String(error)); });
    return () => { alive = false; };
  }, [root, path, revision, mode]);
  return <div className="files-panel">
    <div className="files-panel__toolbar"><div role="group" aria-label="File view">
      <button aria-pressed={mode === 'changes'} onClick={() => setMode('changes')}>Changes{changes ? ` (${changes.files.length})` : ''}</button>
      <button aria-pressed={mode === 'all'} onClick={() => setMode('all')}>All files</button>
    </div><span className="files-live"><i />{error ? "Unavailable" : "Live"}</span></div>
    {rootError && <p role="alert" className="chat-error">{rootError}</p>}
    {mode === 'all' ? <FileTree folder={root} refreshVersion={revision} /> : <>
      <p className="files-scope" title={root ?? ''}>{title} · {root?.split('/').filter(Boolean).at(-1) ?? 'No project'}</p>
      {error && <p role="alert" className="chat-error">{error}</p>}
      {!changes && !error && !rootError && <p className="files-empty">Checking changes…</p>}
      {changes && !changes.files.length && !error && <p className="files-empty">No uncommitted changes.</p>}
      <div className="files-changes">{changes?.files.map(file => <div key={file.path}>
        <button className="files-change" aria-expanded={path === file.path} onClick={() => { setPreview('Loading changes…'); setPath(path === file.path ? null : file.path); }}>
          <ChevronIcon size={12} /><FileIcon size={14} /><span title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>{file.path}</span><small>{label(file.status)}</small>
        </button>
        {path === file.path && <pre className="files-diff" tabIndex={0} aria-label={`Changes in ${file.path}`}>{preview.split("\n").map((line, index) => <span key={index} className={line.startsWith("+") && !line.startsWith("+++") ? "added" : line.startsWith("-") && !line.startsWith("---") ? "removed" : undefined}>{line || " "}</span>)}</pre>}
      </div>)}</div>
    </>}
  </div>;
}
