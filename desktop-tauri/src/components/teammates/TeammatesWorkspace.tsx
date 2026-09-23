import { Skills } from './Skills';
import { useCallback, useEffect, useState } from 'react';
import { useAccountStore } from '../../state/accountStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { GearIcon, PlusIcon, SearchIcon } from '../common/Icons';
import { ReportProblemButton } from '../report/ReportProblemButton';
import { avatarUrl, message, teammateApi } from './api';
import { Setup } from './Setup';
import { Thread } from './Thread';
import type { Roster, Teammate } from './types';
export function TeammatesWorkspace({ active }: { active: boolean }) {
  const identity = useAccountStore(s => s.snapshot.profile?.email ?? '');
  return <AccountTeammates key={identity} identity={identity} active={active} />;
}
function AccountTeammates({ identity, active }: { identity: string; active: boolean }) {
  const [roster, setRoster] = useState<Roster | null>(null), [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null), [visited, setVisited] = useState<string[]>([]);
  const [query, setQuery] = useState(''), [archived, setArchived] = useState(false);
  const [skills, setSkills] = useState(false);
  const [setup, setSetup] = useState<{ agent?: Teammate } | null>(null);
  const refresh = useCallback(async () => { const data = await teammateApi<Roster>('agents/v1/teammates'); if (data.version !== 1 || !Array.isArray(data.teammates)) throw new Error('Unsupported teammate response.'); setRoster(data); setError(''); }, []);
  useEffect(() => { if (!active || !identity) return; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { await refresh(); } catch (e) { if (!stopped) setError(message(e)); } if (!stopped) timer = setTimeout(poll, 10000); }; void poll(); return () => { stopped = true; clearTimeout(timer); }; }, [active, identity, refresh]);
  const open = (agent: Teammate) => { setSetup(null); setSelected(agent.id); setVisited(ids => ids.includes(agent.id) ? ids : [...ids, agent.id]); };
  const rows = (roster?.teammates ?? []).filter(a => a.archived === archived && `${a.name} ${a.brief}`.toLowerCase().includes(query.toLowerCase()));
  const saved = (agent: Teammate) => { setRoster(r => r ? { ...r, teammates: [agent, ...r.teammates.filter(a => a.id !== agent.id)] } : r); setSetup(null); open(agent); };
  return <div className="teammates-workspace" hidden={!active}>
    <aside className="pstrip teammate-rail" aria-label="Teammates navigation">
      <header><h2>Teammates</h2><button className="icon-btn" aria-label="New teammate" disabled={!roster?.enabled || Boolean(error)} onClick={() => setSetup({})}><PlusIcon size={16} /></button></header>
      <div className="pstrip__search"><SearchIcon size={14} /><input aria-label="Search teammates" placeholder="Search teammates" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="pstrip__scroll">{rows.map(agent => <button className={`teammate-row ${selected === agent.id ? 'selected' : ''}`} key={agent.id} onClick={() => open(agent)} aria-current={selected === agent.id ? 'true' : undefined}>
        <img src={avatarUrl(agent.avatar)} alt="" /><span className="teammate-row-copy"><span><strong>{agent.name}</strong><small>{new Date(agent.updatedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</small></span><span><small>{agent.lastMessage || agent.brief}</small>{(agent.status === 'needs_approval' || agent.unread) && <i className="pstrip__dot pstrip__dot--attention" aria-label={agent.status === 'needs_approval' ? 'Needs your approval' : 'Unread messages'} />}</span></span>
      </button>)}{!rows.length && <p className="pstrip__empty">{roster ? query ? 'No matching teammates.' : 'Your teammates will appear here.' : 'Loading teammates…'}</p>}
      {(archived || roster?.teammates.some(a => a.archived)) && <button className="pstrip__row" onClick={() => setArchived(!archived)}>{archived ? 'Active teammates' : 'Archived teammates'}</button>}</div>
      <footer className="pstrip__footer"><button className="pstrip__row" onClick={() => setSkills(true)}>Skills</button><ReportProblemButton /><button className="pstrip__row" onClick={() => useWorkspaceStore.getState().openSettings()}><GearIcon size={16} />Settings</button></footer>
    </aside>
    <main className="teammates-main">
      {error && <div className="teammate-notice" role="alert">{error}<button onClick={() => void refresh().catch(e => setError(message(e)))}>Refresh teammates</button></div>}
      {roster && !roster.enabled && <p className="teammate-notice">Teammate tasks are paused. Your history remains available.</p>}
      {!selected && !setup && <div className="teammate-welcome"><h2>Your teammates</h2><p>One conversation for each person on your team.</p>{roster?.enabled && <button className="primary" onClick={() => setSetup({})}>New teammate</button>}</div>}
      {visited.map(id => { const agent = roster?.teammates.find(a => a.id === id); return agent ? <Thread key={id} agent={agent} identity={identity} active={active && id === selected && !setup} enabled={roster?.enabled === true && !error} onDetails={() => setSetup({ agent })} /> : null; })}
    {setup && <Setup key={setup.agent?.id ?? 'new'} agent={setup.agent} identity={identity} enabled={roster?.enabled === true} onClose={() => setSetup(null)} onSaved={saved} />}
    </main>
    {skills && <Skills teammates={roster?.teammates ?? []} identity={identity} onClose={() => { setSkills(false); void refresh().catch(e => setError(message(e))); }} />}
  </div>;
}
