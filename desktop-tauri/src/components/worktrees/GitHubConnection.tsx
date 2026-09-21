import { connectorVersion, subscribeConnectorUpdates } from '../../lib/connectorUpdates';
import { IntegrationLogo } from '../settings/IntegrationLogo';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountStore } from '../../state/accountStore';
import { useWorkspaceStore } from '../../state/workspaceStore';

interface Connector { id: string; installed: boolean; account: string | null; credential: { configured?: boolean }; reads?: string; writes?: string }
interface Catalogue { enabled: boolean; integrations: Connector[] }
export function GitHubConnection({ repository, onConnected }: { repository: string | null; onConnected(connected: boolean): void }) {
  const identity = useAccountStore(s => s.snapshot.profile?.email);
  return <GitHubAccount key={identity ?? 'guest'} identity={identity} repository={repository} onConnected={onConnected} />;
}
function GitHubAccount({ identity, repository, onConnected }: { identity?: string; repository: string | null; onConnected(connected: boolean): void }) {
  const [connector, setConnector] = useState<Connector | null>(null);
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true), lock = useRef(false);
  const call = async <T,>(path: string, body?: object) => {
    if (identity !== useAccountStore.getState().snapshot.profile?.email) throw new Error('Your account changed.');
    const version = connectorVersion(identity ?? 'guest');
    const value = await invoke<T>('teammate_request', { path, body: body ?? null });
    if (version !== connectorVersion(identity ?? 'guest')) throw new Error('Connection status changed.');
    if (!alive.current || identity !== useAccountStore.getState().snapshot.profile?.email) throw new Error('Your account changed.');
    return value;
  };
  const accept = (data: Catalogue) => { setConnector(data.integrations.find(c => c.id === 'github') ?? null); setEnabled(data.enabled); setLoaded(true); setError(''); };
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const version = connectorVersion(identity ?? 'guest');
    try { await task(); } catch (e) { if (alive.current && version === connectorVersion(identity ?? 'guest')) setError(String(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const refresh = () => run(async () => accept(await call<Catalogue>('connectors')));
  useEffect(() => { alive.current = true; if (identity) void refresh(); return () => { alive.current = false; }; }, [identity]);
  useEffect(() => subscribeConnectorUpdates(update => {
    if (update.identity !== identity) return;
    setError(update.error ?? '');
    if (update.catalogue) accept(update.catalogue as Catalogue);
    else { setConnector(null); setLoaded(false); }
  }), [identity, onConnected]);
  const connected = !!identity && loaded && enabled && !!connector?.installed && !error;
  useEffect(() => { onConnected(connected); }, [connected, onConnected]);
  useEffect(() => {
    if (!identity) return;
    const verify = () => { void refresh(); };
    window.addEventListener('focus', verify);
    const timer = window.setInterval(verify, 15000);
    return () => { window.removeEventListener('focus', verify); window.clearInterval(timer); };
  }, [identity]);
  const open = () => { if (repository) void invoke('shared_chat_open_link', { url: `https://github.com/${repository}` }).catch(e => setError(String(e))); };
  return <div className="worktree-repo">
    <div className="worktree-repo__name">
      <IntegrationLogo id="github" size={22} />
      <i className={`worktree-dot${connected ? ' worktree-dot--working' : ''}`} title={connected ? `Connected as ${connector?.account ?? 'GitHub'}` : 'GitHub not connected'} />
      {connected && repository ? <button className="worktree-repo__link" title={repository} aria-label="Open repository on GitHub" onClick={open}>{repository}<span aria-hidden="true"> ↗</span></button> : <strong>GitHub</strong>}
      {connected && <button className="worktree-repo__refresh" aria-label="Refresh GitHub connection" title={`Connected as ${connector?.account ?? 'GitHub'} · Refresh`} disabled={busy} onClick={() => void refresh()}>↻</button>}
    </div>
    {!connected && <button className="worktree-link" onClick={() => useWorkspaceStore.getState().openSettingsSection('ai', 'integrations')}>Connect GitHub</button>}
    {identity && !loaded && !error && <p className="worktree-repo__status">Checking GitHub…</p>}
    {connected && !repository && <p className="worktree-repo__status">No GitHub origin remote in this project.</p>}
    {error && <p className="worktree-error" role="alert">{error} <button onClick={() => void refresh()} disabled={busy}>Retry</button></p>}
  </div>;
}
