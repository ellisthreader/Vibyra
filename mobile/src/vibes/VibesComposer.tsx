import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';

export function VibesComposer({ text, onChange, model, onModel, trialRemaining, maximum, busy, disabled, onSend, onStop }: {
  text: string; onChange(value: string): void; model: string; onModel(): void; trialRemaining?: number; maximum?: number;
  busy: boolean; disabled: boolean; onSend(): void; onStop(): void;
}) {
  const { colors, dark } = useTheme();
  return <View style={[s.wrap, { backgroundColor: colors.background }]}>
    <View style={[s.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput accessibilityLabel="Message Vibyra AI" multiline value={text} onChangeText={onChange} maxLength={4000}
        placeholder="What would you like to build?" placeholderTextColor={colors.muted} keyboardAppearance={dark ? 'dark' : 'light'}
        style={[s.input, { color: colors.text }]} textAlignVertical="top" />
      <View style={s.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose AI model" onPress={onModel} style={s.model}>
          <Icon name="sparkles-outline" size={15} color={colors.accent} /><Text numberOfLines={1} style={[s.modelName, { color: colors.text }]}>{model}</Text>
          <Icon name="chevron-down" size={12} color={colors.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Stop AI reply' : 'Send message'} disabled={!busy && disabled}
          accessibilityState={{ disabled: !busy && disabled }} onPress={busy ? onStop : onSend}
          style={[s.send, { backgroundColor: !busy && disabled ? colors.elevated : colors.action }]}>
          <Icon name={busy ? 'stop' : 'arrow-up'} size={22} color={!busy && disabled ? colors.muted : colors.onAction} />
        </Pressable>
      </View>
    </View>
    <View style={s.estimate}>
      <Text style={[s.caption, { color: colors.muted }]}>{busy ? 'Your next draft can wait here.' : maximum !== undefined
        ? 'This reply uses up to ' + maximum + ' Vibes' : trialRemaining !== undefined
          ? `${trialRemaining} trial Vibes left in this chat` : 'Vibes power your AI. You stay in control.'}</Text></View>
  </View>;
}
const s = StyleSheet.create({ wrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5 }, box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, padding: 13 },
  input: { fontSize: 16, lineHeight: 24, padding: 4, minHeight: 66, maxHeight: 150, outlineWidth: 0 }, toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  model: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 6, flexShrink: 1 }, modelName: { fontSize: 13, flexShrink: 1 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, estimate: { minHeight: 30, flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center' },
  caption: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
