import { avatarUrl } from './api';
import { TeammateReach } from './TeammateReach';
import { useTeammateOverview, type RunRow } from './useTeammateOverview';
import type { Teammate } from './types';

export type TeammatePage = 'overview' | 'chat' | 'runs';
type Tone = 'done' | 'working' | 'attention' | 'quiet';

const STATES: Record<string, [string, Tone]> = {
  completed: ['Finished', 'done'], failed: ['Failed', 'attention'], cancelled: ['Cancelled', 'quiet'], outcome_unknown: ['Unclear', 'attention'],
  queued: ['Queued', 'working'], starting: ['Starting', 'working'], running: ['Running', 'working'], waiting_for_tool: ['Running', 'working'],
  waiting_for_approval: ['Needs you', 'attention'], waiting_for_signin: ['Needs sign-in', 'attention'], waiting: ['Needs you', 'attention'],
  waiting_for_computer: ['Waiting for Mac', 'quiet'], paused_by_limits: ['Paused', 'quiet'],
};
const stateOf = (state: string): [string, Tone] => STATES[state] ?? [state.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), 'quiet'];

function when(iso: string): string {
  const date = new Date(iso); if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days > 0 && days < 7) return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function RunList({ runs, limit }: { runs: RunRow[]; limit: number }) {
  return <div className="tm-card tm-list">{runs.slice(0, limit).map(run => { const [word, tone] = stateOf(run.state); return <div className="tm-row" key={run.id}>
    <i className={`tm-dot tm-dot--${tone}`} aria-hidden="true" />
    <span className="tm-row__copy"><span>{run.prompt || 'Task'}</span></span>
    <span className="tm-row__time">{when(run.createdAt)}</span>
    <span className={`sb-pill tm-pill--${tone}`}>{word}</span>
  </div>; })}</div>;
}

/** A teammate's page (storyboard frame 5): who it is, then Overview · Chat ·
 * Runs · Access · Memory. Overview shows only figures the service returns. */
export function TeammateOverview({ agent, v2, enabled, page, active, onPage, onEdit, onSaved, onBack }: {
  agent: Teammate; v2: boolean; enabled: boolean; page: TeammatePage; active: boolean;
  onPage(page: TeammatePage): void; onEdit(tab?: 'Access' | 'Memory'): void; onSaved(agent: Teammate): void; onBack(): void;
}) {
  const data = useTeammateOverview(agent, v2, active && page !== 'chat');
  const last = data.runs[0];
  const tabs: [string, () => void, boolean][] = [['Overview', () => onPage('overview'), page === 'overview'], ['Chat', () => onPage('chat'), page === 'chat'],
    ['Runs', () => onPage('runs'), page === 'runs'], ['Access', () => onEdit('Access'), false], ['Memory', () => onEdit('Memory'), false]];
  return <section className={`tm-page tm-page--${page}`} aria-label={agent.name}>
    <header className="tm-head">
      <button className="icon-btn teammate-back" aria-label="Back to teammates" onClick={onBack}>←</button>
      <img src={avatarUrl(agent.avatar)} alt="" />
      <div className="tm-head__copy"><h1>{agent.name}</h1><p>{agent.brief}</p></div>
      <button className="btn tm-head__edit" onClick={() => onEdit()}>Edit</button>
      <button className="btn btn--primary tm-head__message" onClick={() => onPage('chat')}>Message</button>
    </header>
    <nav className="tm-tabs" role="tablist" aria-label="Teammate">{tabs.map(([name, go, on]) => <button key={name} role="tab" aria-selected={on} onClick={go}>{name}</button>)}</nav>
    {page === 'overview' && <div className="tm-body">
      <div className="tm-stats">
        <div className="tm-card tm-stat"><small>Last run</small><strong>{last ? when(last.createdAt) : data.ready ? 'No runs yet' : '…'}</strong>
          {last && <span className={`tm-stat__note tm-note--${stateOf(last.state)[1]}`}>{stateOf(last.state)[0]}</span>}</div>
        <div className="tm-card tm-stat"><small>Budget per task</small><strong>{agent.budget} tokens</strong><span className="tm-stat__note">The most one task can use</span></div>
        <div className="tm-card tm-stat"><small>Next run</small><strong>{data.next ?? 'Not scheduled'}</strong>
          <span className="tm-stat__note">{data.next ? 'From its schedule' : v2 ? 'Add a schedule on Access' : 'Runs when you message it'}</span></div>
      </div>
      <div className="tm-columns">
        <section className="tm-runs" aria-label="Recent runs"><h3>Recent runs</h3>
          {data.runs.length ? <RunList runs={data.runs} limit={5} /> : <div className="tm-card"><p className="tm-empty">{data.error || (data.ready ? 'Nothing has run yet. Send a message to start.' : 'Loading…')}</p></div>}</section>
        <TeammateReach agent={agent} enabled={enabled} onSaved={onSaved} onAccess={() => onEdit('Access')} />
      </div>
    </div>}
    {page === 'runs' && <div className="tm-body"><section className="tm-runs" aria-label="Runs"><h3>Runs</h3>
      {data.runs.length ? <RunList runs={data.runs} limit={20} /> : <div className="tm-card"><p className="tm-empty">{data.error || (data.ready ? 'Nothing has run yet.' : 'Loading…')}</p></div>}</section></div>}
  </section>;
}
