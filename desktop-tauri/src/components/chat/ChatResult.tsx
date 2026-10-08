import { memo } from 'react';
import type { AgentItem } from '../../ipc/sharedChats';
import { durationLabel } from '../../../../mobile/src/conversation/inspection';
import { ConversationProse } from '../sharedChats/ConversationProse';
import type { TurnStats } from './chatRows';
import { ChatAlertIcon, ChatChevronIcon, ChatDiffIcon, ChatDoneIcon, ChatStopIcon } from './chatIcons';

const REPEATS = ['finished', 'stopped', 'something went wrong', 'task finished', 'completed', 'task completed', 'done'];

/**
 * How a turn ended in one quiet line ("Worked for 48s"), and what it changed
 * in one row that opens the review: "Edited 2 files +12 −3 · Review".
 */
export const ChatResult = memo(function ChatResult({ item, stats, onReview }: {
  item: AgentItem; stats: TurnStats; onReview?: () => void;
}) {
  const time = stats.duration != null ? durationLabel(stats.duration) : null;
  const status = item.status === 'failed' ? 'failed' : item.status === 'interrupted' ? 'interrupted' : 'completed';
  const label = status === 'completed' ? (time ? `Worked for ${time}` : 'Done')
    : status === 'interrupted' ? (time ? `Stopped after ${time}` : 'Stopped') : 'Something went wrong';
  const text = (item.text || item.title || '').trim();
  const repeated = REPEATS.includes(text.replace(/[.!]+$/, '').toLowerCase());
  const Glyph = status === 'completed' ? ChatDoneIcon : status === 'interrupted' ? ChatStopIcon : ChatAlertIcon;
  return <div className={`chat-result chat-result--${status}`} role="status">
    <p className="chat-result__line"><Glyph size={14} /><span>{label}</span></p>
    {text && !repeated && (status === 'failed' ? <p className="chat-result__error">{text}</p> : <ConversationProse text={text} />)}
    {stats.files > 0 && <button type="button" className="chat-changes" disabled={!onReview} onClick={onReview}
      aria-label={`Edited ${stats.files} ${stats.files === 1 ? 'file' : 'files'}, ${stats.added} lines added, ${stats.removed} removed. Review changes`}>
      <ChatDiffIcon size={15} />
      <span className="chat-changes__label">Edited {stats.files} {stats.files === 1 ? 'file' : 'files'}</span>
      <span className="chat-counts"><span className="chat-add">+{stats.added}</span> <span className="chat-del">−{stats.removed}</span></span>
      {onReview && <span className="chat-changes__review">Review <ChatChevronIcon size={12} /></span>}
    </button>}
  </div>;
});
