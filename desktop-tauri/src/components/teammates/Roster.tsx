import { GearIcon, PlusIcon, SearchIcon } from '../common/Icons';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { ReportProblemButton } from '../report/ReportProblemButton';
import { avatarUrl } from './api';
import type { Teammate } from './types';
function teammateTime(value: string) {
  const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
interface Props {
  rows: Teammate[]; selected: string | null; query: string; archived: boolean; hasArchived: boolean;
  loading: boolean; error: string; enabled: boolean; hasRoster: boolean;
  onRefresh(): void; onQuery(value: string): void; onArchive(): void; onOpen(agent: Teammate): void; onNew(): void; onSkills(): void;
}
export function Roster(props: Props) {
  return <aside className="pstrip teammate-rail" aria-label="Teammates navigation">
    <div className="teammate-search-row"><div className="pstrip__search"><SearchIcon size={14} /><input aria-label="Search teammates" placeholder="Search teammates" value={props.query} onChange={e => props.onQuery(e.target.value)} /></div>
      <button className="icon-btn" aria-label="New teammate" title="New teammate" disabled={!props.enabled} onClick={props.onNew}><PlusIcon size={17} /></button></div>
    <div className="pstrip__scroll">{props.error && <div className="teammate-rail-status" role="alert"><span>{props.error}</span><button disabled={props.loading} onClick={props.onRefresh}>{props.loading ? 'Refreshing…' : 'Retry'}</button></div>}
      {props.archived && <p className="teammate-list-label">Archived teammates</p>}
      {props.rows.map(agent => <button className={`teammate-row ${props.selected === agent.id ? 'selected' : ''}`} key={agent.id} onClick={() => props.onOpen(agent)} aria-current={props.selected === agent.id ? 'true' : undefined}>
        <img src={avatarUrl(agent.avatar)} alt="" /><span className="teammate-row-copy"><span><strong>{agent.name}</strong><time dateTime={agent.updatedAt}>{teammateTime(agent.updatedAt)}</time></span>
          <span><small>{agent.lastMessage || agent.brief}</small>{agent.status === 'needs_approval' ? <i className="teammate-dot approval" aria-label="Needs your approval" /> : agent.unread ? <i className="teammate-dot" aria-label="Unread messages" /> : null}</span></span>
      </button>)}
      {!props.rows.length && <p className="pstrip__empty" role="status">{!props.hasRoster ? props.error ? 'Unable to load teammates.' : 'Loading teammates…' : props.query ? 'No matching teammates.' : props.archived ? 'No archived teammates.' : 'No teammates yet.'}</p>}
    </div>
    <footer className="pstrip__footer">{(props.archived || props.hasArchived) && <button className="pstrip__row" onClick={props.onArchive}>{props.archived ? 'Back to active teammates' : 'Archived teammates'}</button>}
      <button className="pstrip__row" onClick={props.onSkills}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4zm16 0h-4a3 3 0 0 0-3 3m0 14a4 4 0 0 1 4-3h3z" /></svg>Skills</button>
      <ReportProblemButton />
      <button className="pstrip__row" onClick={() => useWorkspaceStore.getState().openSettings()}><GearIcon size={16} />Settings</button></footer>
  </aside>;
}
