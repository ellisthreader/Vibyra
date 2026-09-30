import { useEffect, useRef, useState } from 'react';
import { message, teammateApi } from './api';
interface Connector { id: string; name: string; installed: boolean; reads: string | null; writes: string | null; credential: { configured: boolean } }
interface Catalogue { enabled: boolean; integrations: Connector[] }
export function ToolGrants({ selected, onChange }: { selected: string[]; onChange(ids: string[]): void }) {
  const [catalogue, setCatalogue] = useState<Catalogue>({enabled:false,integrations:[]}), [error, setError] = useState('');
  const [flow, setFlow] = useState<string | null>(null), [busy, setBusy] = useState(false), [disconnect, setDisconnect] = useState<Connector | null>(null);
  const lock = useRef(false);
  useEffect(() => { let alive = true; void teammateApi<Catalogue>('connectors').then(data => { if (alive) setCatalogue(data); }).catch(e => { if (alive) setError(message(e)); }); return () => { alive = false; }; }, []);
  const run = async (task: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await task(); } catch(e) { setError(message(e)); } finally {lock.current=false;setBusy(false);} };
  const connect = (id: string) => run(async () => { const data = await teammateApi<{flowId:string}>(`connectors/${id}/start`, {}); setFlow(data.flowId); });
  const check = () => run(async () => { if (!flow) return; const data = await teammateApi<{status:string;error?:string;catalogue:Catalogue}>(`connectors/flows/${flow}`); setCatalogue(data.catalogue); if(data.status !== 'pending') setFlow(null); if(data.status !== 'connected') setError(data.error ?? (data.status === 'pending' ? 'Finish signing in, then check again.' : 'Sign-in expired. Connect again.')); });
  const remove = () => run(async () => { if(!disconnect)return; setCatalogue(await teammateApi<Catalogue>(`connectors/${disconnect.id}/disconnect`,{})); onChange(selected.filter(id=>id!==disconnect.id)); setDisconnect(null); });
  const {integrations:items,enabled}=catalogue;
  return <div><label>Connected services</label>{items.filter(item => item.installed).map(item => <label key={item.id} className="teammate-grant">
    <span><input type="checkbox" checked={selected.includes(item.id)} disabled={!enabled || (!selected.includes(item.id) && selected.length >= 3)} onChange={e => onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />{item.name}</span>
    <small>{item.reads}{item.writes ? ` · ${item.writes}` : ''}</small>
  </label>)}{!items.some(item => item.installed) && <small>No services connected.</small>}
    {selected.filter(id => !items.some(item => item.id === id && item.installed)).map(id => <label key={id}><input type="checkbox" checked onChange={() => onChange(selected.filter(value => value !== id))} />{id} · unavailable</label>)}
    <details><summary>Manage connections</summary>{items.map(item=><div className="teammate-connection" key={item.id}><span>{item.name}</span><button type="button" disabled={busy || (!item.installed && (!enabled || !item.credential.configured))} onClick={()=>item.installed?setDisconnect(item):void connect(item.id)}>{item.installed?'Disconnect':item.credential.configured?'Connect':'Unavailable'}</button></div>)}
      {flow && <button type="button" disabled={busy} onClick={()=>void check()}>Check sign-in</button>}
      {disconnect && <div role="alert">Disconnect {disconnect.name} for all your teammates?<button type="button" disabled={busy} onClick={()=>void remove()}>Disconnect service</button><button type="button" onClick={()=>setDisconnect(null)}>Cancel</button></div>}
    </details>
    {error && <p role="alert">{error}</p>}<small>Choose up to three services. Actions that require your approval stay in the conversation.</small>
  </div>;
}
