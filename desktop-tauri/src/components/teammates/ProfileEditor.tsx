import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { avatarUrl } from './api';
import { ToolGrants } from './ToolGrants';
import { EnginePicker } from './EnginePicker';
import { ProfileChoices } from './ProfileChoices';
export interface ProfileFields { name: string; brief: string; memory: string; budget: number; avatar: string; integrations: string[]; model?: string; skillIds?: string[] }
const tabs = ['Profile', 'Skills', 'Memory', 'Access'] as const;
export function ProfileEditor({ fields, update, disabled, storage, onSkillEditing, accessExtra }: { storage: string; onSkillEditing(value: boolean): void; fields: ProfileFields; update(key: string, value: unknown): void; disabled: boolean; accessExtra?: ReactNode }) {
  const [tab, setTab] = useState<typeof tabs[number]>('Profile'); const id = useId();
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
    if (next < 0) return; event.preventDefault(); setTab(tabs[next]); document.getElementById(`${id}-tab-${next}`)?.focus();
  };
  return <div className="profile-editor">
    <div className="profile-tabs" role="tablist" aria-label="Teammate settings">{tabs.map((name, index) => <button type="button" role="tab" id={`${id}-tab-${index}`} key={name}
      aria-selected={tab === name} aria-controls={`${id}-panel-${index}`} tabIndex={tab === name ? 0 : -1} onKeyDown={e => navigate(e, index)} onClick={() => setTab(name)}>{name}{name === 'Skills' && Boolean(fields.skillIds?.length) && <small>{fields.skillIds!.length}</small>}</button>)}</div>
    <div className="profile-scroll">
      {tabs.map((name, index) => <section role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={tab !== name} key={name}>
        <fieldset disabled={disabled}>
          {name === 'Profile' && <div className="profile-overview">
            <div className="profile-identity"><div className="profile-name"><img src={avatarUrl(fields.avatar)} alt="" /><label>Name<input maxLength={80} value={fields.name} placeholder="e.g. Website reviewer" onChange={e => update('name', e.target.value)} /></label></div>
              <div className="teammate-avatars" aria-label="Appearance">{['oncall','lead','review','bugs','assistant','db','site','qa','sprout'].map(avatar => <button type="button" key={avatar} aria-label={`Choose ${avatar} avatar`} aria-pressed={fields.avatar === avatar} onClick={() => update('avatar', avatar)}><img src={avatarUrl(avatar)} alt="" /></button>)}</div>
            </div>
            <div className="profile-grid profile-balanced"><div className="profile-basics"><h3>Brief</h3><p className="profile-help">The job you want this teammate to do.</p>
              <textarea aria-label="Brief" maxLength={4000} value={fields.brief} placeholder="Describe the goal, the steps to follow, and a useful result…" onChange={e => update('brief', e.target.value)} />
            </div><EnginePicker model={fields.model} onChange={model => update('model', model)} /></div>
          </div>}
          {name === 'Skills' && <ProfileChoices storage={storage} disabled={disabled} onEditing={onSkillEditing} kind="skills" fields={fields} update={update} />}
          {name === 'Memory' && <div className="profile-basics"><h3>Memory</h3><p className="profile-help">Preferences and context to include with every task.</p><label>Saved context<textarea maxLength={4000} value={fields.memory} placeholder="Your preferences, project context and important facts…" onChange={e => update('memory', e.target.value)} /></label></div>}
          {name === 'Access' && <div className="profile-grid"><div className="profile-basics"><h3>Tools</h3><ToolGrants selected={fields.integrations} onChange={ids => update('integrations', ids)} /></div>
            <div className="profile-basics"><h3>Task budget</h3><p className="profile-help">Maximum Vibes per task. Unused Vibes return to your balance.</p><div className="profile-providers">{[5,10,20].map(value => <button key={value} type="button" aria-pressed={fields.budget === value} onClick={() => update('budget', value)}>{value} Vibes</button>)}</div><label>Custom budget<input type="number" min={1} max={50} value={fields.budget} onChange={e => update('budget', Number(e.target.value))} /></label></div>
          </div>}{name === 'Access' && accessExtra}
        </fieldset>
      </section>)}
    </div>
  </div>;
}
