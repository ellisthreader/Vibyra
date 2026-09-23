import { useEffect, useRef, useState } from 'react';
import { message, teammateApi } from './api';
export interface ProfileSkill { id: string; revision: number; name: string; instructions: string; teammateIds: string[] }
export function NewSkill({ storage, disabled, onSaved, onEditing }: { storage: string; disabled: boolean; onSaved(skill: ProfileSkill): void; onEditing(value: boolean): void }) {
  const savedCallback = useRef(onSaved); savedCallback.current = onSaved;
  const key = `${storage}.new-skill`;
  const [state, setState] = useState<{ draft: ProfileSkill | null; pending: boolean }>(() => { try { const raw = JSON.parse(localStorage.getItem(key) ?? 'null'); if (raw === null || (raw.draft === null && raw.pending === false)) return { draft: null, pending: false }; if (raw?.draft?.id && typeof raw.draft.name === 'string' && typeof raw.draft.instructions === 'string' && Array.isArray(raw.draft.teammateIds) && typeof raw.pending === 'boolean') return raw; return { draft: null, pending: true }; } catch { return { draft: null, pending: true }; } });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const lock = useRef(false);
  useEffect(() => { onEditing(Boolean(state.draft) || state.pending); }, [state.draft, state.pending, onEditing]);
  const persist = (next: typeof state) => { localStorage.setItem(key, JSON.stringify(next)); setState(next); };
  const change = (patch: Partial<ProfileSkill>) => { if (!state.draft || state.pending || busy) return; try { persist({ ...state, draft: { ...state.draft, ...patch } }); } catch { setError('Could not save this skill draft on this Mac.'); } };
  const save = async () => {
    if (lock.current || !state.draft || disabled) return; lock.current = true; setBusy(true); setError('');
    try {
      persist({ ...state, pending: true });
      const { skill } = await teammateApi<{ skill: ProfileSkill }>('agents/v1/skills', state.draft);
      savedCallback.current(skill); localStorage.removeItem(key); setState({ draft: null, pending: false });
    } catch (e) { const detail = message(e); if (/^(400|403|404|409|422):/.test(detail)) { try { persist({ ...state, pending: false }); } catch {} } setError(detail); }
    finally { lock.current = false; setBusy(false); }
  };
  const begin = () => { try { persist({ draft: { id: crypto.randomUUID(), revision: 0, name: '', instructions: '', teammateIds: [] }, pending: false }); setError(''); } catch { setError('Could not create a local skill draft.'); } };
  if (!state.draft) return <div><button type="button" className="profile-secondary" disabled={disabled || state.pending} onClick={begin}>New skill</button>{state.pending && <p role="alert">Could not restore the saved skill draft. Reopen this page to try again.</p>}{error && <p role="alert">{error}</p>}</div>;
  return <div className="skill-editor" aria-label="New skill"><h3>New skill</h3><p className="profile-help">Describe a repeatable task or way of working.</p>
    <label>Name<input aria-label="Skill name" maxLength={80} value={state.draft.name} disabled={disabled || busy || state.pending} placeholder="e.g. Review checklist" onChange={e => change({ name: e.target.value })} /></label>
    <label>Instructions<textarea aria-label="Skill instructions" maxLength={4000} value={state.draft.instructions} disabled={disabled || busy || state.pending} placeholder="When to use this skill, the steps to follow, and the result to produce…" onChange={e => change({ instructions: e.target.value })} /></label>
    <p className="profile-help">Saved to your library and selected here. Save the teammate to apply it.</p>
    {error && <p role="alert">{error}</p>}<div className="skill-actions"><button type="button" className="primary" disabled={disabled || busy || !state.draft.name.trim() || !state.draft.instructions.trim()} onClick={() => void save()}>{busy ? 'Saving…' : state.pending ? 'Retry skill save' : 'Save skill'}</button>
      {!state.pending && <button type="button" className="profile-secondary" disabled={busy} onClick={() => { try { localStorage.removeItem(key); setState({ draft: null, pending: false }); } catch { setError('Could not clear this skill draft on this Mac.'); } }}>Cancel skill</button>}</div>
  </div>;
}
