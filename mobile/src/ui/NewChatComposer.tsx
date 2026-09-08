import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import type { SessionKind } from './types';

export function NewChatComposer({ value, onChange, onStart, connected }: {
  value: string; onChange: (value: string) => void;
  onStart: (kind: SessionKind, prompt: string) => void; connected: boolean;
}) {
  const { colors, dark } = useTheme();
  return <View style={s.dock}>
    <View style={[s.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput accessibilityLabel="Prompt for new chat" value={value} onChangeText={onChange}
        placeholder="What do you want to build?" placeholderTextColor={colors.muted} multiline
        keyboardAppearance={dark ? 'dark' : 'light'} autoCorrect={false} textAlignVertical="top"
        style={[s.input, { color: colors.text }]} />
      <View style={s.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose project and agent"
          onPress={() => onStart('claude', value)} style={s.context}>
          <Icon name="add" size={24} color={colors.muted} />
          <Text style={[s.agent, { color: colors.text }]}>Choose agent</Text>
          <Icon name="chevron-down" size={12} color={colors.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Create chat with draft"
          accessibilityState={{ disabled: !value.trim() }} disabled={!value.trim()}
          onPress={() => onStart('claude', value)}
          style={[s.send, { backgroundColor: value.trim() ? colors.action : colors.elevated }]}>
          <Icon name="arrow-up" size={23} color={value.trim() ? colors.onAction : colors.muted} />
        </Pressable>
      </View>
    </View>
    <Text style={[s.note, { color: colors.muted }]}>{connected ? 'Your computer. Your workspace.' : 'Connect your computer to start coding.'}</Text>
  </View>;
}
const s = StyleSheet.create({
  dock: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  composer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 28, padding: 10 },
  input: { fontSize: 17, lineHeight: 25, minHeight: 62, maxHeight: 140, padding: 10, outlineWidth: 0 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  context: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 9, paddingHorizontal: 8 },
  agent: { fontSize: 13, fontWeight: '500' },
  send: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  note: { textAlign: 'center', fontSize: 11, paddingTop: 12, paddingBottom: 2 },
});
