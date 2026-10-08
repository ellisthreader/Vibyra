import { useState } from 'react';
import { useConnectors } from '../settings/useConnectors';
import { message } from './api';
import { MAX_GRANTS } from './grantTick';
import { setService } from './teammateSave';
import type { Teammate } from './types';

/** What this teammate can reach. Connected services are switches that save
 * at once; anything not connected yet is set up on the Access tab. */
export function TeammateReach({ agent, enabled, onSaved, onAccess }: { agent: Teammate; enabled: boolean; onSaved(agent: Teammate): void; onAccess(): void }) {
  const { catalogue, error: loadError } = useConnectors();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const items = catalogue?.integrations ?? [];
  const usable = enabled && catalogue?.enabled === true;
  const toggle = async (id: string, allowed: boolean) => {
    setBusy(id); setError('');
    try { onSaved(await setService(agent, id, allowed)); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };
  return <section className="tm-reach" aria-label="Can reach">
    <h3>Can reach</h3>
    <div className="tm-card tm-list">
      {!catalogue && <p className="tm-empty">{loadError ? 'Services could not be loaded. They stay editable on the Access tab.' : 'Loading services…'}</p>}
      {catalogue && !items.length && <p className="tm-empty">No services are available yet.</p>}
      {items.map(item => {
        const on = agent.integrations.includes(item.id);
        return <div className="tm-row" key={item.id}>
          <span className="tm-row__copy"><span>{item.name}</span>{!item.installed && <small>Not connected</small>}</span>
          {item.installed
            ? <button type="button" role="switch" aria-checked={on} aria-label={`Let ${agent.name} use ${item.name}`} className="tm-switch"
              disabled={!usable || busy !== null || agent.archived || (!on && agent.integrations.length >= MAX_GRANTS)}
              onClick={() => void toggle(item.id, !on)}><span /></button>
            : <button type="button" className="btn tm-small" disabled={!usable} onClick={onAccess}>Set up</button>}
        </div>;
      })}
    </div>
    {error && <p className="tm-error" role="alert">{error}</p>}
  </section>;
}
