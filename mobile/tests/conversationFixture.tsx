import { useState } from 'react';
import { Text, View } from 'react-native';
import { ConversationView } from '../src/conversation/ConversationView';
import { ConversationApprovalDock } from '../src/conversation/ConversationApprovalDock';
import { ConversationItem, ConversationStatus } from '../src/conversation/types';
import { ThemeContext, palettes } from '../src/theme';
import type { AgentItem } from '../src/state/conversationTypes';

declare global {
  interface Window { conversationCalls: unknown[] }
  var conversationCalls: unknown[];
}
globalThis.conversationCalls = [];
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const scenario = query.get('state') ?? 'permission';
const dark = query.get('theme') !== 'light';
const colors = dark ? palettes.dark : palettes.light;
// Steps as the Mac reports them for Codex, Claude and Gemini alike (see stepLabel.ts).
const step = (id: string, source: Partial<AgentItem>, status: 'running' | 'completed' | 'failed' = 'completed', detail = ''): ConversationItem =>
  ({ id, turnId: 'turn', kind: 'activity', title: 'Working', detail, status,
    source: { id, turnId: 'turn', kind: 'activity', status, ...source } as AgentItem });
const base: ConversationItem[] = [
  { id: 'user', turnId: 'turn', kind: 'message', role: 'user', text: 'Make the welcome screen feel simpler.' },
  { id: 'assistant', turnId: 'turn', kind: 'message', role: 'assistant',
    text: 'I’ll look at the welcome screen and its tests first.' },
  step('read', { category: 'commandExecution', command: 'read src/Welcome.tsx', actions: [{ type: 'read', path: 'src/Welcome.tsx' }] }, 'completed', 'read src/Welcome.tsx\nexport function Welcome() {…}'),
  step('search', { category: 'commandExecution', command: 'grep PrimaryButton', actions: [{ type: 'search', query: 'PrimaryButton' }] }),
];
const moreWork: ConversationItem[] = [
  { id: 'found', turnId: 'turn', kind: 'message', role: 'assistant', text: 'The spacing comes from three nested cards. I’ll flatten them into one column.' },
  step('edit', { category: 'fileChange', changes: [{ path: 'src/Welcome.tsx', kind: { type: 'update' }, added: 18, removed: 41 }] }),
  step('edit2', { category: 'fileChange', changes: [{ path: 'src/welcome.css', kind: { type: 'update' }, added: 4, removed: 9 }] }),
  step('test', { category: 'commandExecution', command: 'cd /projects/pocket && npm test -- welcome', durationMs: 8400, actions: [{ type: 'unknown' }] }, 'completed', 'npm test -- welcome\n✓ 12 passed'),
  step('lint', { category: 'commandExecution', command: 'npm run lint', actions: [{ type: 'unknown' }] }, 'failed', 'npm run lint\n1 error'),
];
const plan = step('plan', { category: 'plan' }, 'completed', '- [x] Read the welcome screen\n- [~] Flatten the nested cards\n- [ ] Run the welcome tests');
const permission: Extract<ConversationItem, { kind: 'permission' }> = { id: 'permission', turnId: 'turn', kind: 'permission',
  title: 'Run the welcome screen checks', reason: 'Verify the updated layout before finishing.',
  scope: 'This command only · /projects/pocket', detail: 'npm run test -- welcome', status: 'pending' };
const dockPermission: typeof permission = { ...permission, title: 'Allow this command?',
  detail: "Environment: local\n/bin/zsh -lc 'npm run test -- welcome'",
  choices: ['accept', 'acceptWithExecpolicyAmendment', 'decline'],
  ruleSummary: 'Codex will remember these exact command-prefix tokens: ["npm","run","test","--","welcome"]. Future matching commands may run without asking.' };
const question: ConversationItem = { id: 'question', turnId: 'turn', kind: 'question',
  title: 'A quick design choice', status: 'pending', questions: [{ id: 'style',
    prompt: 'How should the welcome screen feel?', allowFreeform: true, options: [
      { id: 'calm', label: 'Calm and minimal', description: 'More space, one clear action.' },
      { id: 'bold', label: 'Bold and expressive', description: 'Stronger colour and larger type.' },
    ] }] };
export function ConversationFixture() {
  const [items, setItems] = useState<ConversationItem[]>(() => {
    if (scenario === 'idle') return [];
    if (scenario === 'question') return [...base, question];
    if (scenario === 'approval-dock') return [...base, dockPermission];
    if (scenario === 'working') return [...base, step('run', { category: 'commandExecution', command: 'npm run test -- welcome', actions: [{ type: 'unknown' }] }, 'running')];
    if (scenario === 'plan') return [...base, plan, step('run', { category: 'commandExecution', actions: [{ type: 'read', path: 'src/Welcome.tsx' }] }, 'running')];
    if (scenario === 'long') return [...base, ...moreWork, { id: 'result', turnId: 'turn', kind: 'result', status: 'completed', text: 'Finished' }];
    if (scenario === 'completed' || scenario === 'error') return [...base, ...moreWork.slice(0, 2), {
      id: 'result', turnId: 'turn', kind: 'result', status: scenario === 'error' ? 'failed' : 'completed',
      text: scenario === 'error' ? 'The check could not finish. Your changes are still available.' : 'The welcome screen is simpler and the layout checks passed.',
      checks: scenario === 'completed' ? ['npm run test -- welcome · exit 0'] : [],
    }];
    if (scenario === 'mac' || scenario === 'mac-answered') return [...base, { id: 'mac', turnId: 'turn', kind: 'permission',
      title: 'A connected tool needs your input', reason: 'github is asking which repository to use.',
      scope: '/projects/pocket', status: scenario === 'mac' ? 'elsewhere' : 'answered' }];
    const last: ConversationItem = scenario === 'denied' ? { ...permission, status: 'declined' } : permission;
    return [...base, last];
  });
  const status: ConversationStatus = ['working', 'plan'].includes(scenario) ? 'working' : scenario === 'error' ? 'error'
    : ['permission', 'approval-dock', 'question', 'offline', 'observer', 'typing-off', 'mac'].includes(scenario) ? 'waiting' : 'idle';
  const docked = scenario === 'approval-dock' ? items.find(item => item.kind === 'permission' &&
    (item.status === 'pending' || item.status === 'resolving')) : null;
  const resolve = async (id: string, response: unknown) => {
    globalThis.conversationCalls.push({ id, response });
    setItems(old => old.map(item => item.id === id && (item.kind === 'permission' || item.kind === 'question')
      ? { ...item, status: 'resolving' } : item));
  };
  return <ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.workspace }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Welcome screen</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Conversation design fixture</Text>
      </View>
      <ConversationView items={items} status={status} connected={scenario !== 'offline'} dockedPermissionId={docked?.id}
        canRespond={!['observer', 'typing-off'].includes(scenario)} onDecision={resolve}
        blocked={scenario === 'typing-off' ? { reason: 'Typing from your phone is off. Turn it on in Vibyra on your Mac: Settings › iPhone connection.' }
          : scenario === 'offline' ? { reason: 'Reconnect to your Mac to answer.' }
          : { reason: 'Your Mac is in control of this chat.', action: { label: 'Take control to answer', onPress: () => { globalThis.conversationCalls.push({ takeControl: true }); } } }} onAnswer={resolve}
        onReview={() => { globalThis.conversationCalls.push({ review: true }); }} />
      {docked?.kind === 'permission' && <ConversationApprovalDock item={docked} canRespond onDecision={resolve} />}
      {scenario === 'approval-dock' && <View style={{ height: 112, marginHorizontal: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
        <Text style={{ color: colors.muted }}>Message…</Text>
      </View>}
    </View>
  </ThemeContext.Provider>;
}
