import { useEffect, useState } from 'react';
import { chatRequest, type ConversationSnapshot } from '../../ipc/sharedChats';
import { AgentMark } from '../common/AgentMark';
import type { ModelChoice } from '../../../../mobile/src/conversation/inspection';

export function ConversationControls({ sessionId, snapshot, disabled }: { sessionId: string; snapshot: ConversationSnapshot | null; disabled: boolean }) {
  const [models, setModels] = useState<ModelChoice[]>([]); const [panel, setPanel] = useState<'model' | 'effort' | null>(null);
  const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void chatRequest<{ models: ModelChoice[] }>('conversation.models', { sessionId }).then(value => { if (alive) setModels(value.models); }).catch(error => { if (alive) setError(String(error)); });
    return () => { alive = false; };
  }, [sessionId]);
  const chosen = models.find(model => model.model === snapshot?.settings?.model);
  const ladder = chosen?.supportedReasoningEfforts ?? [];
  const level = ladder.findIndex(effort => effort.reasoningEffort === snapshot?.settings?.effort);
  const apply = async (model: string, effort: string) => {
    if (disabled || saving) return;
    setSaving(true); setError('');
    try { await chatRequest('conversation.settings', { sessionId, requestId: crypto.randomUUID(), revision: snapshot?.settings?.revision ?? 0, model, effort }); setPanel(null); }
    catch (error) { setError(String(error)); } finally { setSaving(false); }
  };
  return <div className="conversation-settings">
    <div className="conversation-model-pill"><button type="button" aria-label="Choose AI model" aria-expanded={panel === 'model'} onClick={() => setPanel(panel === 'model' ? null : 'model')}>
      <AgentMark agentId="codex" name="OpenAI" accent="var(--accent)" size={20} /><span>{chosen?.displayName ?? snapshot?.settings?.model ?? 'Codex'}</span><small>⌄</small></button>
      <button type="button" aria-label="Thinking effort" aria-expanded={panel === 'effort'} onClick={() => setPanel(panel === 'effort' ? null : 'effort')}><span className="effort-pulse">⌁</span>{snapshot?.settings?.effort ?? 'Fixed'}</button></div>
    {panel && <div className="conversation-settings-popover" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setPanel(null); } }}>
      <header><strong>{panel === 'model' ? 'Choose your AI' : 'Thinking effort'}</strong><button type="button" aria-label="Close model settings" onClick={() => setPanel(null)}>×</button></header>
      {error && <p role="alert">{error}</p>}
      {panel === 'model' ? <><input aria-label="Search models" placeholder="Search models…" value={query} onChange={event => setQuery(event.target.value)} />
        <p className="conversation-provider-label">OpenAI · this computer account</p><div className="conversation-model-options">
          {models.filter(model => `${model.displayName} ${model.model}`.toLowerCase().includes(query.toLowerCase())).map(model => <button type="button" role="radio" aria-checked={model.model === chosen?.model} disabled={disabled || saving}
            key={model.model} onClick={() => void apply(model.model, model.defaultReasoningEffort)}><AgentMark agentId="codex" name="OpenAI" accent="var(--accent)" size={22} /><span>{model.displayName}</span><small>{model.model === chosen?.model ? '✓' : ''}</small></button>)}</div></>
        : <><p>Applies to your next turn.</p><div className="conversation-effort-options" role="group" aria-label="Reasoning effort">
          {ladder.map((effort, index) => <button type="button" key={effort.reasoningEffort} title={effort.description} aria-pressed={level === index} disabled={disabled || saving}
            onClick={() => { if (chosen) void apply(chosen.model, effort.reasoningEffort); }}>{effort.reasoningEffort}</button>)}
        </div>{!ladder.length && <p>This model does not expose adjustable effort.</p>}</>}
      {saving && <p role="status">Applying…</p>}
    </div>}
  </div>;
}
