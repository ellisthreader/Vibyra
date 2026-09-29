import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PhoneKeyboard } from '../src/phoneKeyboard/PhoneKeyboard';
import { ThemeContext, palettes } from '../src/theme';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import { PhoneTextController } from '../src/phoneKeyboard/MacFieldController';
import type { FocusedTextRequest } from '../src/phoneKeyboard/types';

export function PhoneKeyboardFixture() {
  const [macText, setMacText] = useState('Draft on Mac');
  const [typing, setTyping] = useState(true);
  const [connected, setConnected] = useState(true);
  const [dark, setDark] = useState(true);
  const fixture = useMemo(() => {
    let id = 0;
    const mac = new PhoneTextController(() => String(++id));
    const field = { fieldId: 'fixture', label: 'Message Codex', context: 'Keyboard QA project',
      value: 'Draft on Mac', selection: { start: 12, end: 12 }, maxLength: 8000, multiline: true,
      read: () => ({ text: field.value, selection: field.selection }),
      apply: (text: string, selection: { start: number; end: number }) => { field.value = text; field.selection = selection; setMacText(text); },
    };
    mac.focus(field);
    const request: FocusedTextRequest = async (method, params = {}) => mac.handle('phone', `focusedText.${method}`, params);
    return { mac, field, request };
  }, []);
  const colors = dark ? palettes.dark : palettes.light;
  return <ThemeContext.Provider value={{ colors, dark }}><View style={{ flex: 1, backgroundColor: colors.background, padding: 30, paddingTop: 70, gap: 20 }}>
    <Text style={{ color: colors.text }}>Phone keyboard QA · simulated Mac field</Text>
    <Text testID="confirmed-mac-value" accessibilityLabel={`Confirmed Mac value: ${macText}`} style={{ color: colors.text }}>{macText}</Text>
    <PhoneKeyboard workspace={{ ...fixtureWorkspace, status: connected ? 'connected' : 'offline', canType: typing, focusedTextAvailable: true,
      actions: { ...fixtureWorkspace.actions, focusedText: fixture.request } }} />
    <Pressable accessibilityRole="button" accessibilityLabel="Mac takes over" onPress={() => {
      fixture.field.value = 'Edited on Mac'; fixture.field.selection = { start: 13, end: 13 };
      setMacText(fixture.field.value); fixture.mac.localChange();
    }}><Text style={{ color: colors.accent }}>Mac takes over</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Revoke phone typing" onPress={() => setTyping(false)}><Text style={{ color: colors.accent }}>Revoke phone typing</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Switch theme" onPress={() => setDark(!dark)}><Text style={{ color: colors.accent }}>Switch theme</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Toggle connection" onPress={() => setConnected(!connected)}><Text style={{ color: colors.accent }}>Toggle connection</Text></Pressable>
  </View></ThemeContext.Provider>;
}
