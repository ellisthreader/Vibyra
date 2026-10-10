import {GroupsPanel} from './groups/GroupsPanel';
import {DigestDialog} from './work/DigestDialog';
import {stageFourClient} from '../../../../mobile/src/agents/v2/stageFourClient';
import {teammateApi} from './api';
import { useEffect, useRef, useState } from 'react';
import { useAccountStore } from '../../state/accountStore';
import { useTeammateFocus } from '../../state/teammateFocusStore';
import { accountBillingPage } from '../../ipc/accountBilling';
import { avatarUrl } from './api';
import { Roster } from './Roster';
import { Skills } from './Skills';
import { Setup } from './Setup';
import { Thread } from './Thread';
import { Activity } from './Activity';
import { useRoster } from './useRoster';
import { useCompactLayout } from './useCompactLayout';
import { useRunMode } from './useRunHistory';
import { TeammateOverview, type TeammatePage } from './TeammateOverview';
import type { Teammate } from './types';
export function TeammatesWorkspace({ active }: { active: boolean }) {
  const identity = useAccountStore(s => s.snapshot.profile?.email ?? '');
  return <AccountTeammates key={identity} identity={identity} active={active} />;
}
function AccountTeammates({ identity, active }: { identity: string; active: boolean }) {
  const { ref, compact } = useCompactLayout();
  const mode = useRunMode(identity, active);
  const state = useRoster(active, identity, mode === 'v2'), { roster, error, loading, refresh } = state;
  const selectionKey = `teammate-selection.${encodeURIComponent(identity)}`;
  const [selected, setSelected] = useState<string | null>(null), [visited, setVisited] = useState<string[]>([]);
  const [query, setQuery] = useState(''), [archived, setArchived] = useState(false), [showList, setShowList] = useState(true);
  const [skills, setSkills] = useState(false), [setup, setSetup] = useState<{ agent?: Teammate; tab?: 'Access' | 'Memory'|'Work' } | null>(null);
  const [groupsOpen,setGroupsOpen]=useState(false);
  const [activity, setActivity] = useState(false), [page, setPage] = useState<TeammatePage>('overview');
  const digest=useTeammateFocus(s=>s.digest),[workApi]=useState(()=>stageFourClient(teammateApi));
  const [preparedDraft,setPreparedDraft]=useState<{agentId:string;nonce:number;prompt:string}>();
  const restored = useRef(false);
  // The tab you chose carries across teammates; anything new from a teammate
  // (unread messages, an approval) opens its chat, where that news is.
  const open = (agent: Teammate, next?: TeammatePage) => {
    const news = agent.unread === true || agent.status === 'needs_approval' || Boolean(agent.pendingDecisionCount);
    setSetup(null); setActivity(false); setSelected(agent.id); setShowList(false);
    setPage(page => next ?? (news ? 'chat' : page === 'runs' ? 'overview' : page));
    setVisited(ids => ids.includes(agent.id) ? ids : [...ids, agent.id]);
    try { localStorage.setItem(selectionKey, agent.id); } catch {}
  };
  useEffect(() => {
    if (!roster || restored.current) return; restored.current = true;
    let id: string | null = null; try { id = localStorage.getItem(selectionKey); } catch {}
    const agent = roster.teammates.find(a => a.id === id);
    if (agent) { setArchived(agent.archived); open(agent); }
  }, [roster]);
  // Notification bridge (Agent V2 Phase 3, lib/useTeammateRunNotifications): open a requested teammate once, report the visible thread.
  const requested = useTeammateFocus(s => s.requested), handled = useRef(0);
  useEffect(() => { if (!requested || requested.nonce === handled.current) return; const agent = roster?.teammates.find(a => a.id === requested.id); if (!agent) return; handled.current = requested.nonce; restored.current = true; setSkills(false); setArchived(agent.archived); open(agent, 'chat'); }, [requested, roster]);
  const visibleThread = active && !groupsOpen && page === 'chat' && !setup && !skills && !activity && (!compact || !showList) ? selected : null;
  useEffect(() => { useTeammateFocus.getState().setVisible(visibleThread); return () => useTeammateFocus.getState().setVisible(null); }, [visibleThread]);
  const rows = (roster?.teammates ?? []).filter(a => a.archived === archived && `${a.name} ${a.brief}`.toLowerCase().includes(query.trim().toLowerCase()));
  const saved = (agent: Teammate) => { state.saved(agent); setArchived(agent.archived); open(agent); };
  const create = () => { setActivity(false); setSetup({}); setShowList(false); };
  const openActivity = () => { setActivity(true); setSetup(null); setShowList(false); };
  // A starter teammate opens its setup on Access, where its suggestions wait to be ticked.
  const createdFromTemplate = (agent: Teammate) => { state.saved(agent); setArchived(agent.archived); open(agent); setSetup({ agent, tab: 'Access' }); };
  const back = () => { setSetup(null); setShowList(true); };
  // The server decides; an older one that omits `entitled` means included.
  const entitled = roster?.entitled !== false;
  const enabled = roster?.enabled === true && !error && entitled;
  const missing = Boolean(selected && roster && !roster.teammates.some(a => a.id === selected));
  const current = roster?.teammates.find(a => a.id === selected);
  const trail = activity ? 'Activity' : setup ? setup.agent?.name ?? 'New teammate' : current?.name ?? null;
  useEffect(() => { useTeammateFocus.getState().setTrail(trail); }, [trail]);
  return <div ref={ref} className={`teammates-workspace ${showList && !setup && !activity ? 'show-roster' : 'show-thread'}`} hidden={!active}>
    <Roster onGroups={mode==='v2'?()=>setGroupsOpen(true):undefined} v2={mode === 'v2'} activity={activity} onActivity={openActivity} rows={rows} selected={setup || activity ? null : selected} query={query} archived={archived} hasArchived={Boolean(roster?.teammates.some(a => a.archived))}
      onRefresh={() => void refresh()} loading={loading} error={error} hasRoster={Boolean(roster)} enabled={enabled} onQuery={setQuery} onArchive={() => setArchived(!archived)} onOpen={open} onNew={create} onSkills={() => setSkills(true)} />
    <main className="teammates-main">
      {error && <div className="teammate-notice error" role="alert"><span>{error}</span><button disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Retry'}</button></div>}
      {roster && !roster.enabled && <p className="teammate-notice">Teammate tasks are paused. Your history remains available.</p>}
      {roster && roster.enabled && !entitled && <div className="teammate-notice"><span>Agents are part of Vibyra Pro. Your teammates and their history stay here.</span><button onClick={() => void accountBillingPage('plans').catch(() => {})}>Get Pro</button></div>}
      {(!selected || missing) && !setup && !activity && <div className="teammate-welcome">
        <div className="teammate-welcome-art" aria-hidden="true">{['review','sprout','assistant'].map(a => <img key={a} src={avatarUrl(a)} alt="" />)}</div>
        <h2>{missing ? 'Conversation unavailable' : roster?.teammates.some(a => !a.archived) ? 'Your team, ready when you are' : 'A little help. A lot more done.'}</h2>
        <p>{missing ? 'This teammate is no longer available. Choose a conversation from your list.' : error ? 'Reconnect to load your team and conversations.' : !roster ? 'Loading your team…' : !entitled ? 'Give teammates a job and they keep working while you’re away. Agents come with Vibyra Pro.' : 'Give a teammate a job, add the context, and work together in one conversation.'}</p>
        {enabled && !missing && <button className="primary" onClick={create}>New teammate</button>}
        {roster && !error && !entitled && !missing && <button className="primary" onClick={() => void accountBillingPage('plans').catch(() => {})}>Get Vibyra Pro</button>}
      </div>}
      {current && !setup && !activity && <TeammateOverview agent={current} v2={mode === 'v2'} enabled={enabled} page={page} active={active && (!compact || !showList)}
        onPage={setPage} onEdit={tab => { setSetup({ agent: current, tab }); setShowList(false); }} onSaved={state.replace} onBack={back} />}
      {visited.map(id => { const agent = roster?.teammates.find(a => a.id === id); return agent ? <Thread key={`${id}.${agent.chatId}.${mode}`} agent={agent} identity={identity} v2={mode === 'v2'} header={false}
        preparedDraft={preparedDraft?.agentId===id?preparedDraft:undefined} active={active && !groupsOpen && id === selected && page === 'chat' && !setup && !skills && !activity && (!compact || !showList)} enabled={enabled} onBack={back} onRead={cursor => state.read(id, cursor)} onAccess={state.replace} onReload={() => void refresh()} onDetails={tab => { setSetup({ agent, tab }); setShowList(false); }} /> : null; })}
      {activity && !setup && <Activity teammates={roster?.teammates ?? []} onOpen={open} onBack={() => { setActivity(false); setShowList(true); }} />}
      {setup && <Setup key={setup.agent?.id ?? 'new'} agent={setup.agent} tab={setup.tab} v2={mode === 'v2'} onTemplate={createdFromTemplate} identity={identity} enabled={enabled}
        onDraft={prompt=>{if(setup.agent){setPreparedDraft({agentId:setup.agent.id,nonce:Date.now(),prompt});open(setup.agent,'chat');}}}
        localComputer={roster?.capabilities?.localComputer === true}
        vmTests={roster?.capabilities?.vmTests === true}
        onClose={() => { setSetup(null); if (!selected) setShowList(true); }} onSaved={saved} />}
    </main>
    {digest&&digest.account===identity&&<DigestDialog key={digest.nonce} api={workApi.signals} id={digest.id} identity={identity} onClose={()=>useTeammateFocus.getState().closeDigest()}/>}
    {groupsOpen&&<GroupsPanel identity={identity} teammates={roster?.teammates??[]} active={active} disabled={!enabled} onClose={()=>setGroupsOpen(false)} onOpenRun={(agentId,runId)=>{setGroupsOpen(false);useTeammateFocus.getState().request(agentId,runId);}}/>}
    {skills && <Skills teammates={roster?.teammates ?? []} identity={identity} onClose={() => { setSkills(false); void refresh(); }} />}
  </div>;
}
