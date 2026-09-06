import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Hint, Icon } from './primitives';

export function Composer({ value, onChange, onSend, disabled, shell }: {
  value: string; onChange: (value: string) => void; onSend: (value: string) => Promise<boolean>;
  disabled: boolean; shell: boolean;
}) {
  const { colors } = useTheme();
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (sending || disabled || !value.trim()) return;
    setSending(true);
    const submitted = value;
    try { if (await onSend(submitted)) onChange(''); } finally { setSending(false); }
  };
  return <View style={[s.container, { backgroundColor: colors.background }]}>
    <View style={[s.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput accessibilityLabel={shell ? 'Command for computer terminal' : 'Prompt for coding agent'}
        placeholder={disabled ? 'Reconnect to continue…' : shell ? 'Type a command…' : 'What would you like to build?'}
        placeholderTextColor={colors.muted} value={value} onChangeText={onChange} multiline
        editable={!sending} autoCorrect={false} autoCapitalize="none" spellCheck={false}
        style={[s.input, { color: colors.text }]} textAlignVertical="top" />
      <View style={s.toolbar}>
        <View style={s.label}><Icon name="desktop-outline" size={14} color={colors.muted} />
          <Text style={[s.labelText, { color: colors.muted }]}>Runs on your computer</Text></View>
        <Pressable onPress={() => void send()} disabled={disabled || sending || !value.trim()}
          accessibilityRole="button" accessibilityLabel={shell ? 'Send command and Enter' : 'Send prompt and Enter'}
          accessibilityState={{ disabled: disabled || sending || !value.trim(), busy: sending }}
          style={[s.send, { backgroundColor: value.trim() && !disabled ? colors.action : colors.elevated }]}>
          {sending ? <ActivityIndicator color={colors.onAction} /> :
            <Icon name="arrow-up" size={23} color={value.trim() && !disabled ? colors.onAction : colors.muted} />}
        </Pressable>
      </View>
    </View>
    {disabled && value.length > 0 && <View style={s.draftHint}><Hint>Your draft stays here until you can send it.</Hint></View>}
  </View>;
}
const s = StyleSheet.create({
  container: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8 },
  composer: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  input: { fontSize: 16, lineHeight: 23, minHeight: 48, maxHeight: 150, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingLeft: 8, flex: 1 },
  labelText: { fontSize: 11, flexShrink: 1 }, send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  draftHint: { paddingHorizontal: 8, paddingTop: 7 },
});
