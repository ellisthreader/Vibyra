import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { ConversationView } from '../src/conversation/ConversationView';
import { ConversationItem, ConversationStatus } from '../src/conversation/types';
import { ThemeContext, palettes } from '../src/theme';

declare global {
  interface Window { conversationCalls: unknown[] }
  var conversationCalls: unknown[];
}
globalThis.conversationCalls = [];
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const scenario = query.get('state') ?? 'permission';
const dark = query.get('theme') !== 'light';
const colors = dark ? palettes.dark : palettes.light;
const base: ConversationItem[] = [
  { id: 'user', turnId: 'turn', kind: 'message', role: 'user', text: 'Make the welcome screen feel simpler.' },
  { id: 'assistant', turnId: 'turn', kind: 'message', role: 'assistant',
    text: 'I found the welcome screen. I’m refining the spacing and keeping the main action easy to reach.' },
  { id: 'read', turnId: 'turn', kind: 'activity', title: 'Reading files',
    detail: 'cat src/Welcome.tsx', status: 'completed' },
];
const permission: ConversationItem = { id: 'permission', turnId: 'turn', kind: 'permission',
  title: 'Run the welcome screen checks', reason: 'Verify the updated layout before finishing.',
  scope: 'This command only · /projects/pocket', detail: 'npm run test -- welcome', status: 'pending' };
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
    if (scenario === 'working') return [...base, { id: 'run', turnId: 'turn', kind: 'activity',
      title: 'Running command', detail: 'npm run test -- welcome', status: 'running' }];
    if (scenario === 'completed' || scenario === 'error') return [...base, {
      id: 'result', turnId: 'turn', kind: 'result', status: scenario === 'error' ? 'failed' : 'completed',
      text: scenario === 'error' ? 'The check could not finish. Your changes are still available.' : 'The welcome screen is simpler and the layout checks passed.',
      checks: scenario === 'completed' ? ['npm run test -- welcome · exit 0'] : [],
    }];
    return [...base, { ...permission, status: scenario === 'denied' ? 'declined' : 'pending' }];
  });
  const status: ConversationStatus = scenario === 'working' ? 'working' : scenario === 'error' ? 'error'
    : ['permission', 'question', 'offline', 'observer'].includes(scenario) ? 'waiting' : 'idle';
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
      <ConversationView items={items} status={status} connected={scenario !== 'offline'}
        canRespond={scenario !== 'observer'} onDecision={resolve} onAnswer={resolve}
        onReview={() => { globalThis.conversationCalls.push({ review: true }); }} />
    </View>
  </ThemeContext.Provider>;
}
