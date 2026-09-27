import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { createRoot } from 'react-dom/client';
import { palettes, ThemeContext } from '../src/theme';
import { CloudComputers } from '../src/connection/CloudComputers';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

let account = 'first@example.com';
const calls: string[] = [];
(window as unknown as { cloudCalls: string[] }).cloudCalls = calls;
const list = async () => {
  calls.push(account);
  return {
    live: true,
    entitled: true,
    computers: [{
      id: account === 'first@example.com' ? 'a'.repeat(64) : 'b'.repeat(64),
      name: account === 'first@example.com' ? 'First account Mac' : 'Second account Mac',
      platform: 'macos', version: null, online: true, lastSeenAt: null, activeSessions: 0,
    }],
  };
};
const actions = { ...fixtureWorkspace.actions, listComputers: list };

function Fixture() {
  const [email, setEmail] = useState<string | null>(account);
  const workspace = {
    ...fixtureWorkspace,
    account: email ? { ...fixtureWorkspace.account!, email } : null,
    actions,
  } as WorkspaceModel;
  return <View>
    <Pressable accessibilityRole="button" onPress={() => {
      account = 'second@example.com';
      setEmail(account);
    }}><Text>Switch account</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => setEmail(null)}><Text>Sign out</Text></Pressable>
    <CloudComputers workspace={workspace} onSelect={() => {}} />
  </View>;
}

createRoot(document.getElementById('root')!).render(
  <ThemeContext.Provider value={{ colors: palettes.light, dark: false }}>
    <Fixture />
  </ThemeContext.Provider>,
);
