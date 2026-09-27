import { memo, useState } from 'react';
import { conversationViewMemory } from '../../../../mobile/src/conversation/viewMemory';
import type { AgentItem } from '../../ipc/sharedChats';
import { durationLabel } from '../../../../mobile/src/conversation/inspection';
export const ActivityTimeline = memo(function ActivityTimeline({ items, onInspect, memoryKey }: { memoryKey: string; items: AgentItem[]; onInspect: (item: AgentItem) => void }) {
  const memory = conversationViewMemory(memoryKey);
  const [expanded, setExpanded] = useState(memory.expanded[items[0].id] ?? false);
  const active = items.filter(item => item.status === 'running');
  const total = items.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);
  const label = active.at(-1)?.title ?? (items.some(item => item.status === 'failed') ? 'Work needs attention'
    : items.length === 1 ? items[0].title : `${items.length} recorded steps`);
  return <details className="conversation-activity" open={expanded} onToggle={event => { memory.expanded[items[0].id] = event.currentTarget.open; setExpanded(event.currentTarget.open); }}><summary><span className={`activity-dot ${active.length ? 'is-active' : ''}`} />
    <span>{label}</span><small>{active.length > 1 ? `${active.length} active` : total ? durationLabel(total) : ''}</small>
    <span className="disclosure-chevron">⌄</span></summary><div className="activity-timeline">
    {items.map(item => <ActivityStep key={item.id} item={item} onInspect={onInspect} memory={memory.steps} />)}
  </div></details>;
}, (a, b) => a.memoryKey === b.memoryKey && a.items.length === b.items.length && a.items.every((item, i) => item === b.items[i]));
function ActivityStep({ item, onInspect, memory }: { memory: Record<string, boolean>; item: AgentItem; onInspect: (item: AgentItem) => void }) {
  const [open, setOpen] = useState(memory[item.id] ?? false);
  return <div className="activity-step"><button className="activity-step-heading" aria-expanded={open} onClick={() => { memory[item.id] = !open; setOpen(!open); }}>
    <span className={`activity-glyph activity-glyph--${item.status}`}>{item.status === 'completed' ? '✓' : item.status === 'running' ? '◌' : '!'}</span>
    <span>{item.title}</span><small>{durationLabel(item.durationMs) || item.status}</small><span>⌄</span></button>
    {open && <div className="activity-step-detail">{item.command && <code>{item.command}</code>}
      {item.category === 'reasoning' ? <p>{item.detail || 'No summary was supplied.'}</p>
        : <pre>{item.detail || 'No additional detail was supplied.'}</pre>}
      <button className="conversation-text-button" onClick={() => onInspect(item)}>Inspect {item.category === 'fileChange' ? 'changes' : 'details'} ↗</button>
      {item.truncated && <small>Retained output limit reached.</small>}
    </div>}
  </div>;
}
