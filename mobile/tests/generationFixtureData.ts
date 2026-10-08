import type { AgentItem } from '../src/state/conversationTypes';
export type GenerationStage = 'thinking' | 'working' | 'streaming' | 'completed' | 'stopped' | 'offline' | 'waiting';
const turnId = 'generation-turn';
const message = (id: string, role: 'user' | 'assistant', text: string, status = 'completed'): AgentItem =>
  ({ id, turnId, kind: 'message', role, text, status });
const activity = (id: string, title: string, category: string, status: string, detail: string): AgentItem =>
  ({ id, turnId, kind: 'activity', title, category, status, detail });
export function generationItems(stage: GenerationStage): AgentItem[] {
  const user = message('user', 'user', 'Make the welcome screen feel simpler and more welcoming.');
  if (stage === 'thinking') return [user];
  const done = stage === 'completed' || stage === 'streaming';
  const items = [user,
    message('intro', 'assistant', 'I’ll simplify the layout and give the main action more room.'),
    activity('reason', 'Thinking', 'reasoning', done ? 'completed' : 'running', 'Checking the welcome screen layout and the existing spacing system.'),
    activity('read', 'Reading files', 'commandExecution', 'completed', 'sed -n \'1,160p\' src/Welcome.tsx'),
    message('update', 'assistant', 'The welcome screen has everything it needs. I’m simplifying the spacing and making the next step clearer.'),
    activity('edit', 'Updating files', 'fileChange', stage === 'stopped' ? 'interrupted' : done ? 'completed' : 'running', 'src/Welcome.tsx\nAdjusted spacing and simplified the main action.'),
  ];
  if (stage === 'waiting') items.push({ id: 'permission', turnId, kind: 'permission', title: 'Run the layout checks',
    text: 'Verify the welcome screen at small iPhone sizes.', detail: 'npm run test -- welcome', scope: '/projects/pocket', status: 'pending' });
  if (stage === 'streaming' || stage === 'completed') items.push(message('answer', 'assistant',
    stage === 'streaming' ? 'The welcome screen now has a calmer layout, with more room around the main action.'
      : 'The welcome screen now feels calmer and easier to use.\n\n- One clear action to get started\n- More comfortable spacing\n- Cleaner type in light and dark mode\n\nThe layout adapts to smaller iPhones, too.', done && stage !== 'completed' ? 'running' : 'completed'));
  if (stage === 'completed' || stage === 'stopped') items.push({ id: 'result', turnId, kind: 'result',
    status: stage === 'completed' ? 'completed' : 'interrupted', text: stage === 'completed' ? 'Task completed' : 'Stopped', durationMs: 18000 });
  return items;
}
