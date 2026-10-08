import { invoke } from '@tauri-apps/api/core';
import { activityAccount, activityLabel, activityTitle, outcomePill, safeLink, timeWords } from '../../../../mobile/src/agents/v2/activityModel.ts';
import { markId, providerName } from '../../../../mobile/src/agents/v2/providerLabels.ts';
import { HubMark } from '../settings/HubMark';
import { avatarUrl } from './api';
import type { Teammate } from './types';
import { useActivity } from './useActivity';

/**
 * Every tool receipt across the teammates, newest first. Everything here is service text, so it is only
 * ever drawn as text; the one link is the receipt's URL when `safeLink` accepts it for that provider.
 */
export function Activity({ teammates, onOpen, onBack }: { teammates: Teammate[]; onOpen(agent: Teammate): void; onBack(): void }) {
  const feed = useActivity(true);
  const people = teammates.filter(t => !t.archived);
  const openLink = (url: string) => { void invoke('shared_chat_open_link', { url }).catch(() => {}); };
  return <section className="teammate-activity" aria-label="Activity">
    <header className="teammate-activity-head">
      <button type="button" className="icon-btn teammate-back" aria-label="Back to teammates" onClick={onBack}>←</button>
      <div><h2>Activity</h2><p>What your teammates did with your connected services.</p></div>
      <button type="button" disabled={feed.loading} onClick={feed.refresh}>Refresh</button>
    </header>
    <div className="teammate-activity-filters">
      <div role="group" aria-label="Filter by service" className="teammate-chips">
        <button type="button" aria-pressed={feed.provider === null} onClick={() => feed.setProvider(null)}>All services</button>
        {feed.services.map(p => <button type="button" key={p} aria-pressed={feed.provider === p} onClick={() => feed.setProvider(feed.provider === p ? null : p)}>
          <HubMark id={markId(p)} size={16} />{providerName(p)}</button>)}
      </div>
      <label>Teammate<select aria-label="Filter by teammate" value={feed.agentId ?? ''} onChange={e => feed.setAgentId(e.target.value || null)}>
        <option value="">All teammates</option>{people.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    </div>
    <div className="teammate-activity-list" aria-busy={feed.loading}>
      {feed.error && <p role="alert" className="teammate-notice error"><span>{feed.error}</span><button type="button" onClick={feed.refresh}>Retry</button></p>}
      {feed.loading && !feed.items.length && <p className="teammate-activity-empty" role="status">Loading activity…</p>}
      {!feed.loading && !feed.items.length && !feed.error && <p className="teammate-activity-empty" role="status">{feed.provider || feed.agentId ? 'No activity matches these filters.' : 'Nothing yet. When a teammate uses a connected service, each action shows up here.'}</p>}
      <ul>{feed.items.map(item => {
        const pill = outcomePill(item), link = safeLink(item.url, item.provider), agent = teammates.find(t => t.id === item.agentId);
        return <li key={item.id} className="teammate-activity-row">
          <HubMark id={markId(item.provider)} size={28} />
          <button type="button" className="teammate-activity-main" aria-label={activityLabel(item)} disabled={!agent} onClick={() => agent && onOpen(agent)}>
            <span className="teammate-activity-title"><strong>{activityTitle(item)}</strong><span className={`hub-pill ${pill.tone === 'muted' ? '' : `hub-pill--${pill.tone}`}`}>{pill.label}</span></span>
            <small>{activityAccount(item)}</small>
            {item.summary && <small className="teammate-activity-summary">{item.summary}</small>}
            <small className="teammate-activity-who">{agent && <img src={avatarUrl(agent.avatar)} alt="" />}{item.agentName}<time dateTime={item.createdAt} title={item.createdAt}>{timeWords(item.createdAt)}</time></small>
          </button>
          <span className="teammate-activity-slot">{link && <button type="button" className="teammate-activity-link" aria-label={`Open ${activityTitle(item)} in ${providerName(item.provider)}`} onClick={() => openLink(link)}>Open</button>}</span>
        </li>;
      })}</ul>
      {feed.next && <button type="button" className="teammate-activity-more" disabled={feed.more} onClick={feed.loadMore}>{feed.more ? 'Loading…' : 'Load more'}</button>}
    </div>
  </section>;
}
