import { useEffect, useState } from 'react';
import { stageTwoClient } from '../../../../mobile/src/agents/v2/stageTwoModel';
import type { AgentOutput } from '../../../../mobile/src/agents/v2/outputModel';
import { teammateApi } from './api';
import { StageTwoOutput } from './StageTwoOutput';
const api = stageTwoClient(teammateApi);

export function StageTwoOutputs({ agentId, identity, disabled }: { agentId: string; identity: string; disabled: boolean }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<AgentOutput[]>([]), [error, setError] = useState(''), [version, reload] = useState(0);
  useEffect(() => {
    let alive = true; setItems([]); setError('');
    if (open) void api.outputs(agentId).then(value => { if (alive) setItems(value); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [agentId, identity, open, version]);
  return <div className="teammate-outputs-library">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close outputs' : 'Outputs'}</button>
    {open && <section aria-label="Saved outputs"><div><strong>Saved outputs</strong><button type="button" onClick={() => reload(n => n + 1)}>Refresh outputs</button></div>
      {!items.length && !error && <p>Ask this teammate to save a checklist, table or written output. Saved versions appear here.</p>}
      {items.map(item => <StageTwoOutput key={`${identity}:${item.id}:${item.revision}`} output={item} disabled={disabled} />)}
      {error && <p role="alert">{error}</p>}
    </section>}
  </div>;
}
