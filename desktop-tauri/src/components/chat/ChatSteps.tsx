import { memo, useState } from 'react';
import type { AgentItem } from '../../ipc/sharedChats';
import { conversationViewMemory } from '../../../../mobile/src/conversation/viewMemory';
import { durationLabel } from '../../../../mobile/src/conversation/inspection';
import { groupSummary, stepLabel } from './stepLabels';
import { ChatAlertIcon, ChatChevronIcon, STEP_ICONS } from './chatIcons';

/** Up to this many steps show as they are; more fold under one summary line. */
const OPEN_UP_TO = 3;

/**
 * The steps an agent took between two things it said, each naming what it
 * touched. A longer run folds under "Explored 5 files · ran 2 commands", and
 * while the agent works the step in progress (and any failure) stays in view.
 */
export const ChatSteps = memo(function ChatSteps({ id, items, live, memoryKey, onInspect }: {
  id: string; items: AgentItem[]; live: boolean; memoryKey: string; onInspect: (item: AgentItem) => void;
}) {
  const memory = conversationViewMemory(memoryKey);
  const [expanded, setExpanded] = useState(memory.expanded[id] ?? false);
  const folds = items.length > OPEN_UP_TO;
  const failed = items.filter(item => item.status === 'failed').length;
  const running = live ? [...items].reverse().find(item => item.status === 'running') : undefined;
  const shown = !folds || expanded ? items : items.filter(item => item === running || item.status === 'failed');
  const toggle = () => { memory.expanded[id] = !expanded; setExpanded(!expanded); };
  return <div className="chat-steps">
    {folds && <button type="button" className="chat-steps__summary" aria-expanded={expanded} onClick={toggle}>
      <span>{groupSummary(items)}</span>{failed > 0 && <span className="chat-steps__failed"> · {failed} failed</span>}
      <span className={`chat-chevron ${expanded ? 'is-open' : ''}`}><ChatChevronIcon size={12} /></span>
    </button>}
    {shown.map(item => <ChatStep key={item.id} item={item} live={live} memory={memory.steps} onInspect={onInspect} />)}
  </div>;
}, (a, b) => a.id === b.id && a.live === b.live && a.memoryKey === b.memoryKey && a.onInspect === b.onInspect
  && a.items.length === b.items.length && a.items.every((item, i) => item === b.items[i]));

function ChatStep({ item, live, memory, onInspect }: {
  item: AgentItem; live: boolean; memory: Record<string, boolean>; onInspect: (item: AgentItem) => void;
}) {
  const [open, setOpen] = useState(memory[item.id] ?? false);
  const label = stepLabel(item);
  // A step left running by a turn that already ended is not still working.
  const spinning = live && item.status === 'running';
  const failed = item.status === 'failed';
  const edit = label.kind === 'edit';
  const inspectable = edit || Boolean(item.detail?.trim());
  const Glyph = failed ? ChatAlertIcon : STEP_ICONS[label.kind];
  const press = () => {
    if (edit) return onInspect(item);
    memory[item.id] = !open; setOpen(!open);
  };
  return <div className={`chat-step ${failed ? 'is-failed' : ''}`}>
    <button type="button" className="chat-step__row" disabled={!inspectable} onClick={press}
      aria-expanded={inspectable && !edit ? open : undefined} title={edit ? 'Review this change' : undefined}>
      <span className="chat-step__glyph">{spinning ? <span className="chat-spinner" role="status" aria-label="In progress" /> : <Glyph size={14} />}</span>
      <span className="chat-step__text">{label.verb}{label.subject && <> <span className={label.code ? 'chat-step__code' : 'chat-step__subject'}>{label.subject}</span></>}</span>
      {label.added != null && <span className="chat-counts"><span className="chat-add">+{label.added}</span> <span className="chat-del">−{label.removed}</span></span>}
      {!spinning && item.durationMs != null && item.durationMs >= 1000 && <span className="chat-step__time">{durationLabel(item.durationMs)}</span>}
    </button>
    {open && !edit && <div className="chat-step__detail">
      {label.kind === 'think' ? <p>{item.detail}</p> : <pre>{item.detail?.slice(-12000)}{(item.detail?.length ?? 0) > 12000 ? '\nEarlier output omitted from this view.' : ''}</pre>}
      {item.truncated && <small>Retained output limit reached.</small>}
      {item.hasDetail && <button type="button" className="chat-link-button" onClick={() => onInspect(item)}>Open full output</button>}
    </div>}
  </div>;
}
