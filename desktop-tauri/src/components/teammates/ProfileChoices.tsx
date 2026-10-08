import { NewSkill, type ProfileSkill } from './NewSkill';
import { useEffect, useState } from 'react';
import { message, teammateApi } from './api';
import type { ProfileFields } from './ProfileEditor';
type Choice = ProfileSkill & { available?: boolean };
export function ProfileChoices({ kind, fields, update, storage, disabled, onEditing }: { storage: string; disabled: boolean; onEditing(value: boolean): void; kind: 'skills'; fields: ProfileFields; update(key: string, value: unknown): void }) {
  const [choices, setChoices] = useState<Choice[]>([]), [query, setQuery] = useState('');
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; setLoading(true); setError('');
    void teammateApi<{ skills?: Choice[] }>('agents/v1/skills')
      .then(data => { if (alive) setChoices(data.skills ?? []); })
      .catch(e => { if (alive) setError(message(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, retry]);
  const row = (item: Choice) => {
    const checked = (fields.skillIds ?? []).includes(item.id);
    return <button type="button" className="profile-choice" key={item.id} role="checkbox" aria-checked={checked} disabled={item.available === false}
      onClick={() => update('skillIds', checked ? fields.skillIds!.filter(id => id !== item.id) : [...fields.skillIds ?? [], item.id].slice(0, 20))}>
      <span><strong>{item.name}</strong><small>{item.instructions ?? ''}</small></span>
      <span className={checked ? 'profile-check' : ''} aria-hidden="true">{checked ? '●' : '○'}</span>
    </button>;
  };
  const saved = (skill: ProfileSkill) => { setChoices(rows => [skill, ...rows.filter(s => s.id !== skill.id)]); setQuery(''); update('skillIds', Array.from(new Set([...fields.skillIds ?? [], skill.id])).slice(0, 20)); };
  const filtered = choices.filter(item => `${item.name} ${item.instructions ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="profile-picks"><h3>Skills</h3><p className="profile-help">Add repeatable tasks and instructions for this teammate.</p>
    <NewSkill storage={storage} disabled={disabled || (fields.skillIds?.length ?? 0) >= 20} onSaved={saved} onEditing={onEditing} />
    <input aria-label="Search skills" placeholder="Search skills…" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="profile-choices" aria-label="Available skills">{filtered.map(row)}</div>
    {loading && <p className="profile-help">Loading choices…</p>}
    {!loading && !error && !filtered.length && <p className="profile-help">{kind === 'skills' && !choices.length ? 'No skills yet. Create your first skill above.' : 'No matching choices. Try another search.'}</p>}
    {error && <p role="alert">{error}<button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button></p>}
  </div>;
}
