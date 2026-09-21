import { useEffect, useRef, useState } from 'react';
import { chatRequest, type AgentItem, type ConversationSnapshot, type SharedSession } from '../../ipc/sharedChats';
import { changedFiles, readArtifact, type ArtifactPage, type CommandCatalogue, type InspectorMode, type ModelChoice } from '../../../../mobile/src/conversation/inspection';
import { relativeChangePath } from '../../../../mobile/src/conversation/usageSummary';
import { ConversationStatus } from './ConversationStatus';
import { ConversationUsage } from './ConversationUsage';
import { DiffView } from './DiffView';
import { InspectorData } from './InspectorData';
export function ConversationInspector({ mode, selected, session, snapshot, items, onClose, onMode, run, inline = false }: {
  inline?: boolean;
  mode: InspectorMode; selected?: AgentItem; session: SharedSession; snapshot: ConversationSnapshot | null; items: AgentItem[];
  onClose: () => void; onMode: (mode: InspectorMode, item?: AgentItem) => void;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(''); const [model, setModel] = useState(snapshot?.settings?.model ?? '');
  const [effort, setEffort] = useState(snapshot?.settings?.effort ?? ''); const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; if (!inline) panel.current?.focus(); return () => previous?.focus(); }, []);
  useEffect(() => {
    let alive = true; setLoading(true); setError(''); setData(null);
    const request = selected ? readArtifact(p => chatRequest<ArtifactPage>('conversation.artifact', { sessionId: session.id, ...p }), selected)
      : mode === 'diff' || mode === 'context' ? Promise.resolve(null)
      : chatRequest(mode === 'help' ? 'conversation.commands' : mode === 'model' || mode === 'effort' ? 'conversation.models'
        : mode === 'permissions' ? 'conversation.status' : `conversation.${mode}`, { sessionId: session.id });
    void request.then(value => { if (alive) setData(value); }).catch(e => { if (alive) setError(String(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, selected?.id, selected?.artifact?.hash, session.id]);
  const files = changedFiles(items, snapshot?.turnId);
  const models: ModelChoice[] = data?.models ?? [];
  const chosen = models.find(choice => choice.model === model);
  const catalogue: CommandCatalogue | null = mode === 'help' ? data : null;
  const titles = { help: 'Commands', status: 'Session details', usage: 'Usage', model: 'Model', effort: 'Reasoning effort', permissions: 'Permissions', diff: 'Changes', context: 'Observed context' };
  return <aside ref={panel} tabIndex={-1} className={`conversation-inspector ${inline ? 'conversation-inspector--inline' : ''}`} aria-label={selected?.title ?? titles[mode]}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="inspector-heading"><div><small>{selected ? 'RECORDED OPERATION' : 'CONVERSATION'}</small><h2>{selected?.title ?? titles[mode]}</h2></div>
      <button className="icon-btn" aria-label="Close inspector" onClick={onClose}>×</button></header>
    <nav className="inspector-tabs" aria-label="Inspector"><button aria-current={mode === 'diff'} onClick={() => onMode('diff')}>Changes</button>
      <button aria-current={mode === 'context'} onClick={() => onMode('context')}>Context</button><button aria-current={mode === 'status'} onClick={() => onMode('status')}>Details</button></nav>
    <div className="inspector-body">{loading && <p role="status" className="inspector-muted">Loading…</p>}{error && <p role="alert" className="shared-error">{error}</p>}
      {selected && typeof data === 'string' && <><p className="inspector-muted">{selected.status}{selected.exitCode != null ? ` · Exit ${selected.exitCode}` : ''}</p>
        {selected.category === 'fileChange' ? <DiffView content={data} root={snapshot?.workingDirectory} /> : <pre className="inspector-output">{data}</pre>}
        {selected.truncated && <p className="inspector-muted">Only the first 256 KB was retained.</p>}
        <button className="btn" onClick={() => { const url = URL.createObjectURL(new Blob([data], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = 'vibyra-operation.txt'; link.click(); URL.revokeObjectURL(url); }}>Export retained output</button></>}
      {!selected && mode === 'help' && <><input className="inspector-search" aria-label="Search commands" placeholder="Find a command…" value={query} onChange={e => setQuery(e.target.value)} />
        {(catalogue?.commands ?? []).filter(c => `${c.name} ${c.description}`.toLowerCase().includes(query.toLowerCase())).map(c =>
          <button className="inspector-command" key={c.name} onClick={() => c.name === 'stop' ? void run(() => chatRequest('turn.interrupt', { sessionId: session.id, turnId: snapshot?.turnId })) : onMode(c.name as InspectorMode)}>
            <strong>/{c.name}</strong><span>{c.description}</span><small>{c.scope === 'read' ? 'View' : c.scope === 'settings' ? 'Next turn' : 'Control'}</small></button>)}
        <details className="conversation-trust"><summary>Native terminal commands</summary>{catalogue?.unsupported.filter(c => c.name.includes(query.toLowerCase())).map(c => <p key={c.name}><strong>/{c.name}</strong> · {c.reason}</p>)}</details></>}
      {!selected && (mode === 'model' || mode === 'effort') && <><p className="inspector-muted">Applied to your next turn. The current turn keeps its settings.</p>
        <label className="inspector-field">Model<select value={model} onChange={e => { setModel(e.target.value); setEffort(models.find(m => m.model === e.target.value)?.defaultReasoningEffort ?? ''); }}>
          <option value="" disabled>Select a model</option>{models.map(m => <option value={m.model} key={m.model}>{m.displayName}</option>)}</select></label>
        <div className="effort-choices" role="group" aria-label="Reasoning effort">{chosen?.supportedReasoningEfforts.map(e => <button key={e.reasoningEffort} aria-pressed={effort === e.reasoningEffort} title={e.description}
          onClick={() => setEffort(e.reasoningEffort)}>{e.reasoningEffort}</button>)}</div>
        <button className="btn btn--primary" disabled={!chosen || !effort || saving || snapshot?.processState !== 'running'} onClick={() => {
          setSaving(true); void run(() => chatRequest('conversation.settings', { sessionId: session.id, requestId: crypto.randomUUID(), revision: snapshot?.settings?.revision ?? 0, model, effort }))
            .then(ok => { if (ok) onClose(); }).finally(() => setSaving(false));
        }}>{saving ? 'Applying…' : 'Apply for next turn'}</button></>}
      {!selected && mode === 'diff' && <><p className="inspector-muted">{snapshot?.turnId ? 'Current turn' : 'Recorded conversation'} · {files.length} file operations</p>
        {!files.length && <p>No file changes were reported.</p>}{files.map((file, i) => <button key={`${file.item.id}:${i}`} className="inspector-file" onClick={() => onMode('diff', file.item)}>
          <span><strong>{relativeChangePath(file.path, snapshot?.workingDirectory)}</strong><small>{file.operation} · {file.item.status}</small></span><span className="diff-count"><b>+{file.added}</b> <em>−{file.removed}</em></span></button>)}</>}
      {!selected && mode === 'context' && <><p className="inspector-muted">Files, searches and summaries reported by the provider.</p>
        {items.filter(item => item.kind === 'activity').map(item => <button key={item.id} className="inspector-command" onClick={() => onMode('context', item)}><strong>{item.title}</strong><span>{item.status}</span></button>)}</>}
      {!selected && mode === 'status' && data && <ConversationStatus value={data} />}
      {!selected && mode === 'usage' && data && <ConversationUsage value={data} />}
      {!selected && mode === 'permissions' && data && <><InspectorData value={{ approvalPolicy: data.settings?.approvalPolicy, sandbox: data.settings?.sandbox }} />
        <h3>Saved command rules</h3><p className="inspector-muted">Exact command, project and working directory. Managed on this Mac.</p>
        {(data.savedRules ?? []).map((rule: any) => <div className="inspector-rule" key={rule.id}><code>{rule.command}</code><small>{rule.cwd}</small><button className="btn" onClick={() => void run(() => chatRequest('conversation.trust.revoke', { sessionId: session.id, ruleId: rule.id })).then(ok => { if (ok) setData({ ...data, savedRules: data.savedRules.filter((r: any) => r.id !== rule.id) }); })}>Revoke</button></div>)}
        {!data.savedRules?.length && <p>No saved rules for this project.</p>}</>}
    </div>
  </aside>;
}
