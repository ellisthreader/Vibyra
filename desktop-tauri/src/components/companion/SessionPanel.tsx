import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usageSummary } from '../../../../mobile/src/conversation/usageSummary';
import { chatRequest } from '../../ipc/sharedChats';
import { useProjectStore } from '../../state/projectStore';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useProviderAccountStore } from '../../state/providerAccountStore';
import { paneLabel, useTerminalStore } from '../../state/terminalStore';
import './sessionPanel.css';

function duration(start: number | undefined, now: number): string {
  if (!start || !Number.isFinite(start)) return 'Unavailable';
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  if (minutes < 1) return 'Just opened';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}

export function SessionPanel({ active }: { active: boolean }) {
  const projectId = useProjectStore(s => s.activeId);
  const focusedId = useTerminalStore(s => s.focusedId);
  const pane = useTerminalStore(s => s.panes.find(p => p.id === focusedId && p.projectId === projectId));
  const conversationId = useConversationTerminals(s => s.focused);
  const conversation = useConversationTerminals(s => s.sessions.find(item => item.id === conversationId && item.projectId === projectId));
  const selected = pane ?? conversation;
  const [usage, setUsage] = useState<unknown>(null);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const providers = useProviderAccountStore(s => s.providers);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    setUsage(null); setModel(null); setError('');
    if (!active || !conversation) return;
    let live = true;
    const refresh = () => void chatRequest('conversation.usage', { sessionId: conversation.id })
      .then(value => { if (live) { setUsage(value); setError(''); } })
      .catch(cause => { if (live) setError(String(cause)); });
    refresh();
    void chatRequest<{ settings?: { model?: string } }>('conversation.status', { sessionId: conversation.id })
      .then(value => { if (live) setModel(value.settings?.model ?? null); }).catch(() => {});
    const timer = window.setInterval(refresh, 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [active, conversation?.id]);

  if (!selected) return <div className="session-panel session-panel--empty"><span className="session-panel__eyebrow">SESSION</span><h2>Select a terminal</h2><p>Choose a terminal to see its account and activity here.</p></div>;
  const provider = pane?.agentId ?? conversation?.kind ?? 'Agent';
  const accountId = pane?.accountId ?? conversation?.accountId;
  const providerAccount = providers.find(item => item.runtimeId === provider)?.accounts
    .find(item => item.accountId === (accountId || 'default'));
  const start = pane?.openedAt ?? (conversation?.createdAt ? Date.parse(conversation.createdAt) : undefined);
  const summary = usageSummary(usage);
  return <div className="session-panel">
    <span className="session-panel__eyebrow">SELECTED TERMINAL</span>
    <h2>{pane ? paneLabel(pane) : conversation?.title}</h2>
    <p className="session-panel__sub">{provider.charAt(0).toUpperCase() + provider.slice(1)} · {providerAccount?.accountLabel || (accountId ? 'Connected account' : 'Default account')}</p>
    <div className="session-panel__facts">
      <div><span>Open for</span><strong>{duration(start, now)}</strong></div>
      <div><span>Status</span><strong>{pane?.status ?? conversation?.status}</strong></div>
      <div><span>Model</span><strong>{pane?.model || model || 'Provider default'}</strong></div>
    </div>
    <section className="session-panel__section"><h3>Account limits</h3>
      {summary.groups.map(group => <div key={group.name} className="session-panel__group"><p>{group.name}</p>{group.windows.map(window => <div className="session-panel__limit" key={window.label}>
        <div><span>{window.label}</span><strong>{Math.round(window.used)}% used</strong></div>
        <meter min="0" max="100" value={window.used} aria-label={`${window.label} used`} />
        {window.resetsAt && <small>Resets {new Date(window.resetsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</small>}
      </div>)}</div>)}
      {!summary.groups.length && <p className="session-panel__quiet">{pane ? 'This terminal does not report account limits to Vibyra.' : error || summary.note || 'No account limit data reported yet.'}</p>}
      {provider === 'claude' && !summary.groups.length && <button className="session-panel__link" onClick={() => void invoke('shared_chat_open_link', { url: 'https://claude.ai/settings/usage' }).catch(() => {})}>View Claude usage ↗</button>}
    </section>
    <section className="session-panel__section"><h3>This conversation</h3>
      <div className="session-panel__metric"><span>Reported cost</span><strong>{summary.costUsd === undefined ? 'Unavailable' : `$${summary.costUsd.toFixed(2)}`}</strong></div>
      {summary.tokens.map(token => <div className="session-panel__metric" key={token.label}><span>{token.label}</span><strong>{token.value}</strong></div>)}
      {!summary.tokens.length && <p className="session-panel__quiet">{pane ? 'Native terminal usage is not reported here.' : 'Token totals will appear when the provider reports them.'}</p>}
      {pane?.agentId === 'claude' && <p className="session-panel__quiet">Claude CLI: use /cost in this terminal for API billed session spend.</p>}
    </section>
    <p className="session-panel__foot">Limits come from the connected provider. Cost appears only when that provider reports it.</p>
  </div>;
}
