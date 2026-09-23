import { useDialogFocus } from './useDialogFocus';
import { useEffect, useRef, useState } from 'react';
import { message, teammateApi } from './api';
import type { Teammate } from './types';
interface Skill { id: string; revision: number; name: string; instructions: string; teammateIds: string[] }
export function Skills({ teammates, identity, onClose }: { teammates: Teammate[]; identity: string; onClose(): void }) {
  const dialog = useDialogFocus(true, onClose);
  const key = `teammate-skills.${encodeURIComponent(identity)}`;
  const [items, setItems] = useState<Skill[]>([]), [draft, setDraft] = useState<Skill | null>(() => { try { const d = JSON.parse(localStorage.getItem(`${key}.draft`) ?? 'null'); return d && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.instructions === 'string' && Array.isArray(d.teammateIds) ? d : null; } catch { return null; } });
  const [pending, setPending] = useState<Skill | null>(() => { try { const saved=JSON.parse(localStorage.getItem(key) ?? 'null'); return saved && typeof saved.id === 'string' && typeof saved.name === 'string' && typeof saved.instructions === 'string' && Array.isArray(saved.teammateIds) ? saved : null; } catch { return null; } });
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let alive = true; void teammateApi<{ skills: Skill[] }>('agents/v1/skills').then(d => { if (alive) setItems(d.skills); }).catch(e => { if (alive) setError(message(e)); }); return () => { alive = false; }; }, []);
  const change = (next: Skill | null) => { try { if (next) localStorage.setItem(`${key}.draft`, JSON.stringify(next)); else localStorage.removeItem(`${key}.draft`); setDraft(next); } catch { setError('Your skill draft could not be saved on this Mac.'); } };
  const save = async () => { if (lock.current || !(pending ?? draft)) return; lock.current = true; setBusy(true); try {
    const body = pending ?? draft!; localStorage.setItem(key, JSON.stringify(body)); setPending(body);
    const { skill } = await teammateApi<{ skill: Skill }>('agents/v1/skills', body);
    localStorage.removeItem(key); setPending(null); setItems(rows => [skill, ...rows.filter(s => s.id !== skill.id)]); change(null); setError('');
  } catch(e) { const detail = message(e); if (/^(400|403|404|409|422):/.test(detail)) { const saved = pending ?? draft; try { localStorage.removeItem(key); } catch {} setPending(null); change(saved); void teammateApi<{skills:Skill[]}>('agents/v1/skills').then(data => setItems(data.skills)).catch(() => {}); } setError(detail); } finally { lock.current = false; setBusy(false); } };
  const current = pending ?? draft;
  return <div className="focus-dialog-backdrop"><section className="focus-dialog teammate-setup" ref={node => { dialog.current = node; }} role="dialog" aria-modal="true" aria-label="Skills"><header><h2>Skills</h2><button onClick={onClose}>Done</button></header>
    {current ? <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy || Boolean(pending)}>
      <label>Name<input required maxLength={80} value={current.name} onChange={e => change({ ...current, name:e.target.value })} /></label>
      <label>Instructions<textarea required maxLength={4000} value={current.instructions} onChange={e => change({ ...current, instructions:e.target.value })} /></label>
      <label>Assign to teammates</label>{teammates.filter(a => !a.archived).map(a => <label key={a.id}><span><input type="checkbox" checked={current.teammateIds.includes(a.id)} onChange={e => change({ ...current, teammateIds:e.target.checked ? [...current.teammateIds,a.id] : current.teammateIds.filter(id => id!==a.id) })} /> {a.name}</span></label>)}
      <small>Instructions do not grant tool access. Stop affected tasks before saving.</small></fieldset><button disabled={busy} className="primary">{pending ? 'Retry exact save' : 'Save skill'}</button>{!pending && <button type="button" onClick={() => change(null)}>Back</button>}</form>
      : <>{items.map(item => <button className="pstrip__row" key={item.id} onClick={() => change(item)}>{item.name}</button>)}<button className="primary" onClick={() => change({id:crypto.randomUUID(),revision:0,name:'',instructions:'',teammateIds:[]})}>New skill</button></>}
    {error && <p role="alert">{error}</p>}
  </section></div>;
}
