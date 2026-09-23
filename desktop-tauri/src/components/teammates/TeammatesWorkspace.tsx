import { useEffect, useRef, useState } from 'react';
import { useAccountStore } from '../../state/accountStore';
import { avatarUrl } from './api';
import { Roster } from './Roster';
import { Skills } from './Skills';
import { Setup } from './Setup';
import { Thread } from './Thread';
import { useRoster } from './useRoster';
import { useCompactLayout } from './useCompactLayout';
import type { Teammate } from './types';
export function TeammatesWorkspace({ active }: { active: boolean }) {
  const identity = useAccountStore(s => s.snapshot.profile?.email ?? '');
  return <AccountTeammates key={identity} identity={identity} active={active} />;
}
function AccountTeammates({ identity, active }: { identity: string; active: boolean }) {
  const { ref, compact } = useCompactLayout();
  const state = useRoster(active, identity), { roster, error, loading, refresh } = state;
  const selectionKey = `teammate-selection.${encodeURIComponent(identity)}`;
  const [selected, setSelected] = useState<string | null>(null), [visited, setVisited] = useState<string[]>([]);
  const [query, setQuery] = useState(''), [archived, setArchived] = useState(false), [showList, setShowList] = useState(true);
  const [skills, setSkills] = useState(false), [setup, setSetup] = useState<{ agent?: Teammate } | null>(null);
  const restored = useRef(false);
  const open = (agent: Teammate) => {
    setSetup(null); setSelected(agent.id); setShowList(false);
    setVisited(ids => ids.includes(agent.id) ? ids : [...ids, agent.id]);
    try { localStorage.setItem(selectionKey, agent.id); } catch {}
  };
  useEffect(() => {
    if (!roster || restored.current) return; restored.current = true;
    let id: string | null = null; try { id = localStorage.getItem(selectionKey); } catch {}
    const agent = roster.teammates.find(a => a.id === id);
    if (agent) { setArchived(agent.archived); open(agent); }
  }, [roster]);
  const rows = (roster?.teammates ?? []).filter(a => a.archived === archived && `${a.name} ${a.brief}`.toLowerCase().includes(query.trim().toLowerCase()));
  const saved = (agent: Teammate) => { state.saved(agent); setArchived(agent.archived); open(agent); };
  const create = () => { setSetup({}); setShowList(false); };
  const back = () => { setSetup(null); setShowList(true); };
  const enabled = roster?.enabled === true && !error;
  const missing = Boolean(selected && roster && !roster.teammates.some(a => a.id === selected));
  return <div ref={ref} className={`teammates-workspace ${showList && !setup ? 'show-roster' : 'show-thread'}`} hidden={!active}>
    <Roster rows={rows} selected={setup ? null : selected} query={query} archived={archived} hasArchived={Boolean(roster?.teammates.some(a => a.archived))}
      onRefresh={() => void refresh()} loading={loading} error={error} hasRoster={Boolean(roster)} enabled={enabled} onQuery={setQuery} onArchive={() => setArchived(!archived)} onOpen={open} onNew={create} onSkills={() => setSkills(true)} />
    <main className="teammates-main">
      {error && <div className="teammate-notice error" role="alert"><span>{error}</span><button disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Retry'}</button></div>}
      {roster && !roster.enabled && <p className="teammate-notice">Teammate tasks are paused. Your history remains available.</p>}
      {(!selected || missing) && !setup && <div className="teammate-welcome">
        <div className="teammate-welcome-art" aria-hidden="true">{['review','sprout','assistant'].map(a => <img key={a} src={avatarUrl(a)} alt="" />)}</div>
        <h2>{missing ? 'Conversation unavailable' : roster?.teammates.some(a => !a.archived) ? 'Your team, ready when you are' : 'A little help. A lot more done.'}</h2>
        <p>{missing ? 'This teammate is no longer available. Choose a conversation from your list.' : error ? 'Reconnect to load your team and conversations.' : !roster ? 'Loading your team…' : 'Give a teammate a job, add the context, and work together in one conversation.'}</p>
        {enabled && !missing && <button className="primary" onClick={create}>New teammate</button>}
      </div>}
      {visited.map(id => { const agent = roster?.teammates.find(a => a.id === id); return agent ? <Thread key={`${id}.${agent.chatId}`} agent={agent} identity={identity}
        active={active && id === selected && !setup && !skills && (!compact || !showList)} enabled={enabled} onBack={back} onDetails={() => { setSetup({ agent }); setShowList(false); }} /> : null; })}
      {setup && <Setup key={setup.agent?.id ?? 'new'} agent={setup.agent} identity={identity} enabled={enabled}
        localComputer={roster?.capabilities?.localComputer === true}
        onClose={() => { setSetup(null); if (!selected) setShowList(true); }} onSaved={saved} />}
    </main>
    {skills && <Skills teammates={roster?.teammates ?? []} identity={identity} onClose={() => { setSkills(false); void refresh(); }} />}
  </div>;
}
