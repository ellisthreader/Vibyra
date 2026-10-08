import { useEffect, useRef, useState } from 'react';
import { useConnectors, type Connector } from '../settings/useConnectors';
import { MAX_GRANTS, settleConnects, withGrant } from './grantTick';

export function ToolGrants({ selected, onChange }: { selected: string[]; onChange(ids: string[]): void }) {
  const { identity, catalogue, error, busyId, pendingId, connect, disconnect, cancel } = useConnectors();
  const [removing, setRemoving] = useState<Connector | null>(null);
  const items = catalogue?.integrations ?? [];
  const enabled = Boolean(identity && catalogue?.enabled);
  // Services connected from here are allowed for this teammate once they land; services that
  // were already connected are never in `waiting`, so they are never ticked.
  const waiting = useRef<string[]>([]), latest = useRef({ selected, onChange }); latest.current = { selected, onChange };
  const [allowed, setAllowed] = useState<string[]>([]);
  useEffect(() => {
    if (!waiting.current.length) return;
    const installed = items.filter(item => item.installed).map(item => item.id);
    const active = [busyId, pendingId].filter((id): id is string => id !== null);
    const next = settleConnects(waiting.current, installed, active);
    waiting.current = next.waiting;
    if (!next.tick.length) return;
    const ids = next.tick.reduce(withGrant, latest.current.selected);
    if (ids !== latest.current.selected) latest.current.onChange(ids);
    setAllowed(list => [...list, ...next.tick]);
  }, [catalogue, busyId, pendingId]);
  const connectHere = (item: Connector) => { if (!waiting.current.includes(item.id)) waiting.current = [...waiting.current, item.id]; void connect(item.id); };

  return <div>
    <p className="profile-help">Choose the services this teammate can work with.</p>
    {items.map(item => {
      const checked = selected.includes(item.id);
      return <div className="teammate-connection" key={item.id}>
        <span><strong>{item.name}</strong><small>{item.installed ? checked ? allowed.includes(item.id) ? 'Connected · access allowed' : 'Access allowed' : item.credential.kind === 'public' ? 'Ready · access off' : 'Connected · access off' : 'Not connected'}</small>
          <small>{item.reads}{item.writes ? ` · ${item.writes}` : ''}</small></span>
        {item.installed ? <input type="checkbox" aria-label={`Allow ${item.name}`} checked={checked}
            disabled={!enabled || (!checked && selected.length >= MAX_GRANTS)}
            onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />
          : pendingId === item.id ? <button type="button" onClick={cancel}>Cancel sign-in</button>
          : <button type="button" disabled={!enabled || busyId !== null || !item.credential.configured}
            onClick={() => connectHere(item)}>{item.credential.configured ? 'Connect' : 'Unavailable'}</button>}
      </div>;
    })}
    {identity && !catalogue && !error && <small>Checking connected services…</small>}
    {selected.filter(id => !items.some(item => item.id === id && item.installed)).map(id =>
      <label key={id} className="teammate-grant"><input type="checkbox" checked
        onChange={() => onChange(selected.filter(value => value !== id))} />{id} · unavailable</label>)}
    {items.some(item => item.installed && item.credential.kind !== 'public') && <details><summary>Manage connections</summary>
      {items.filter(item => item.installed && item.credential.kind !== 'public').map(item => <div className="teammate-connection" key={item.id}>
        <span>{item.name}</span><button type="button" disabled={busyId !== null} onClick={() => setRemoving(item)}>Disconnect</button>
      </div>)}
      {removing && <div role="alert">Disconnect {removing.name} for all your teammates?
        <button type="button" disabled={busyId !== null} onClick={async () => {
          if (await disconnect(removing.id)) onChange(selected.filter(id => id !== removing.id));
          setRemoving(null);
        }}>Disconnect service</button>
        <button type="button" onClick={() => setRemoving(null)}>Cancel</button>
      </div>}
    </details>}
    {error && <p role="alert">{error}</p>}
    <small>Save to let this teammate use it. Actions that change a service still need your approval.</small>
  </div>;
}
