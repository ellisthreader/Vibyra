import { memo } from 'react';
import type { AgentItem } from '../../ipc/sharedChats';
import { ConversationProse } from '../sharedChats/ConversationProse';
import { ChatListIcon } from './chatIcons';

type Task = { done: boolean; active: boolean; text: string };
/** "- [x] done", "- [~] in progress", "- [ ] to do": the agent's own task list. */
function planTasks(text: string): Task[] | null {
  const tasks = text.split('\n').filter(line => line.trim()).map(line => /^\s*[-*]\s*\[([ xX~])\]\s+(.+)$/.exec(line));
  if (!tasks.length || tasks.some(task => !task)) return null;
  return tasks.map(task => ({ done: /x/i.test(task![1]), active: task![1] === '~', text: task![2] }));
}

/** The agent's plan as one checklist that updates in place, like the phone's. */
export const ChatPlan = memo(function ChatPlan({ item }: { item: AgentItem }) {
  const text = item.detail ?? item.text ?? '';
  const tasks = planTasks(text);
  const done = tasks?.filter(task => task.done).length ?? 0;
  return <section className="chat-card chat-plan" aria-label="Plan">
    <header><ChatListIcon size={14} /><strong>Plan</strong>{tasks && <small>{done} of {tasks.length} done</small>}</header>
    {tasks ? <ul>{tasks.map((task, index) => <li key={index} className={task.done ? 'is-done' : task.active ? 'is-active' : ''}>
      <span className="chat-plan__box" aria-hidden="true" />
      <span>{task.text}</span>
      <span className="sr-only">{task.done ? ', done' : task.active ? ', in progress' : ', to do'}</span>
    </li>)}</ul> : <ConversationProse text={text} />}
  </section>;
});
