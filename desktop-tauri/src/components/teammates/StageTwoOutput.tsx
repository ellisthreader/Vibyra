import { useEffect, useRef, useState } from 'react';
import type { AgentOutput } from '../../../../mobile/src/agents/v2/outputModel';
import { stageTwoClient } from '../../../../mobile/src/agents/v2/stageTwoModel';
import { teammateApi } from './api';
import { browserShare, shareExport } from './shareExport';
import '../../styles/teammate-outputs.css';
const api = stageTwoClient(teammateApi);

export function StageTwoOutput({ output, disabled = false }: { output: AgentOutput; disabled?: boolean }) {
  const [item, setItem] = useState(output), [title, setTitle] = useState(output.title), [content, setContent] = useState(output.content);
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false), epoch = useRef(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  useEffect(() => () => { epoch.current++; }, [output.id]);
  const accept = (value: AgentOutput) => { setItem(value); setTitle(value.title); setContent(value.content); };
  const action = async (work: () => Promise<void>, mutation = false) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice(''); const v = epoch.current;
    try { await work(); } catch (e) { if (v === epoch.current) { if (mutation) setNeedsRefresh(true); setError(e instanceof Error ? e.message : 'Refresh this output to check the change.'); } }
    finally { if (v === epoch.current) { lock.current = false; setBusy(false); } }
  };
  const save = (next = content) => {
    if (disabled || needsRefresh) return Promise.resolve();
    return action(async () => { const v = epoch.current; const value = await api.editOutput(item, title, next); if (v === epoch.current) { accept(value); setEditing(false); } }, true);
  };
  const shown = editing ? content : item.content;
  return <article className="teammate-output" aria-label={`Output: ${item.title}`} aria-busy={busy}>
    <h3>{item.title}</h3><small>Version {item.revision} · {item.kind} · {new Date(item.updatedAt).toLocaleDateString()}</small>
    {editing && <label>Title<input aria-label="Output title" value={title} disabled={disabled || busy} onChange={e => setTitle(e.target.value)} maxLength={160} /></label>}
    {item.kind === 'text' && (editing ? <label>Text<textarea aria-label="Output text" value={content.text} maxLength={30000} disabled={disabled || busy} onChange={e => setContent({ text: e.target.value })} /></label> : <p className="teammate-output-text">{item.content.text}</p>)}
    {item.kind === 'checklist' && shown.items?.map((row, index) => <label className="teammate-output-check" key={row.id}>
      <input type="checkbox" checked={row.checked} disabled={disabled || busy || editing || needsRefresh || Boolean(error)} onChange={() => void save({ ...item.content, items: item.content.items!.map(x => x.id === row.id ? { ...x, checked: !x.checked } : x) })} />
      {editing ? <input aria-label={`Checklist item ${index + 1}`} value={row.text} disabled={disabled || busy} onChange={e => setContent(old => ({ ...old, items: old.items!.map((x, n) => n === index ? { ...x, text: e.target.value } : x) }))} /> : <span>{row.text}</span>}
    </label>)}
    {item.kind === 'table' && <div className="teammate-output-table"><table><thead><tr>{shown.columns?.map((column, i) => <th key={i}>{column}</th>)}</tr></thead><tbody>
      {shown.rows?.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{editing ? <input aria-label={`Row ${i + 1} ${shown.columns?.[j]}`} value={cell} disabled={disabled || busy} onChange={e => setContent(old => ({ ...old, rows: old.rows!.map((r, n) => n === i ? r.map((v, c) => c === j ? e.target.value : v) : r) }))} /> : cell}</td>)}</tr>)}
    </tbody></table></div>}
    <div className="teammate-output-actions">
      {editing ? <><button type="button" disabled={disabled || busy || needsRefresh || Boolean(error)} onClick={() => void save()}>Save output</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setTitle(item.title); setContent(item.content); }}>Cancel changes</button></> : <button type="button" disabled={disabled || busy || needsRefresh || Boolean(error)} onClick={() => setEditing(true)}>Edit output</button>}
      <button type="button" disabled={busy} onClick={() => void action(async () => { const v = epoch.current; const file = await api.exportOutput(item.id); if (v !== epoch.current) return; const result = await shareExport(file, browserShare()); setNotice(result === 'copied' ? 'Output copied.' : 'Output saved.'); })}>Export</button>
      <button type="button" disabled={busy} onClick={() => void action(async () => { const v = epoch.current; const value = await api.output(item.id); if (v === epoch.current) { accept(value); setNeedsRefresh(false); setEditing(false); } })}>Refresh output</button>
    </div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </article>;
}
