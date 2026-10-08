import { memo, useMemo } from 'react';
import type { AgentItem } from '../../ipc/sharedChats';
import { ChatItem } from '../sharedChats/ChatItem';
import { AgentLogo } from '../common/AgentLogo';
import { chatRows, liveOwner, turnStats } from './chatRows';
import { stepLabel } from './stepLabels';
import { ChatMessage } from './ChatMessage';
import { ChatPlan } from './ChatPlan';
import { ChatResult } from './ChatResult';
import { ChatSteps } from './ChatSteps';

const SUGGESTIONS = ['Explain how this project fits together', 'Find and fix a bug', 'Add a small feature'];

/** Everything between the header and the composer, in the phone chat's order and voice. */
export const ChatTranscript = memo(function ChatTranscript({ sessionId, agent, items, turnId, working, waiting, active,
  disabled, run, onInspect, onReview, onSuggest }: {
  sessionId: string; agent: { id: string; name: string }; items: AgentItem[]; turnId?: string | null;
  working: boolean; waiting: boolean; active: boolean; disabled: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  onInspect: (item: AgentItem) => void; onReview?: () => void; onSuggest?: (text: string) => void;
}) {
  const rows = useMemo(() => chatRows(items), [items]);
  const live = liveOwner(rows, working && !waiting, turnId);
  const firstPending = rows.find(row => row.kind === 'request' && row.item.status === 'pending')?.id;
  if (!rows.length && !working) return <div className="chat-empty">
    <AgentLogo agentId={agent.id} name={agent.name} size={44} className="chat-empty__mark" />
    <h2>What shall we build?</h2>
    <p>An idea, a small fix, or something new. {agent.name} works in this project on your Mac.</p>
    {onSuggest && <div className="chat-empty__ideas">{SUGGESTIONS.map(text =>
      <button type="button" key={text} onClick={() => onSuggest(text)}>{text}</button>)}</div>}
  </div>;
  const runningStep = live && live !== 'footer' ? rows.find(row => row.id === live) : undefined;
  return <div className="chat-rows">
    {rows.map(row => {
      if (row.kind === 'steps') return <ChatSteps key={row.id} id={row.id} items={row.items} live={live === row.id} memoryKey={sessionId} onInspect={onInspect} />;
      if (row.kind === 'plan') return <ChatPlan key={row.id} item={row.item} />;
      if (row.kind === 'message') return <ChatMessage key={row.id} item={row.item} live={live === row.id} active={active} onInspect={onInspect} />;
      if (row.kind === 'result') return <ChatResult key={row.id} item={row.item} stats={turnStats(items, row.turnId)} onReview={onReview} />;
      if (row.item.status === 'pending' && firstPending !== row.id) return <p key={row.id} className="chat-queued">
        {row.item.title || 'Request'} · waiting for the earlier request</p>;
      return <div key={row.id} className="chat-request" data-request={row.item.status === 'pending' ? row.id : undefined}>
        <ChatItem item={row.item} sessionId={sessionId} disabled={disabled} run={run} onInspect={onInspect} />
      </div>;
    })}
    {live === 'footer' && <p className="chat-thinking" role="status"><span className="chat-pulse" />Thinking</p>}
    {waiting && !firstPending && <p className="chat-thinking chat-thinking--waiting" role="status"><span className="chat-pulse" />Waiting for your answer</p>}
    {runningStep?.kind === 'steps' && <span className="sr-only" role="status">{(() => {
      const step = [...runningStep.items].reverse().find(item => item.status === 'running');
      const label = step ? stepLabel(step) : null;
      return label ? `${label.verb} ${label.subject ?? ''}` : '';
    })()}</span>}
  </div>;
});
