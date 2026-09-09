import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, IconButton } from './primitives';

export function Composer({ value, onChange, onSend, disabled, shell, demo = false, compact = false,
  contextLabel, onContext, onReview, onStop, working = false }: {
  value: string; onChange: (value: string) => void; onSend: (value: string) => Promise<boolean>;
  disabled: boolean; shell: boolean; demo?: boolean; compact?: boolean;
  contextLabel?: string; onContext?: () => void; onReview?: () => void;
  working?: boolean; onStop?: () => void;
}) {
  const { colors, dark } = useTheme();
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const ready = !disabled && !sending && Boolean(value.trim());
  const send = async () => {
    if (!ready) return;
    setSending(true);
    const submitted = value;
    try { if (await onSend(submitted)) onChange(''); } finally { setSending(false); }
  };
  return <View style={[s.container, { backgroundColor: colors.background }]}>
    <View style={[s.composer, { backgroundColor: colors.surface,
      borderColor: focused ? colors.muted : colors.border }, compact && s.compact]}>
      <TextInput accessibilityLabel={shell ? 'Command for computer terminal' : 'Prompt for coding agent'}
        placeholder={shell ? 'Run a command…' : 'Ask Vibyra to build anything…'}
        placeholderTextColor={colors.muted} value={value} onChangeText={onChange} multiline
        editable={!sending} autoCorrect={false} autoCapitalize="none" spellCheck={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} keyboardAppearance={dark ? 'dark' : 'light'}
        style={[s.input, { color: colors.text }, compact && s.compactInput]} textAlignVertical="top" />
      <View style={s.toolbar}>
        {!compact && <View style={s.tools}>
          {onReview && <IconButton icon="folder-outline" label="Browse project files" onPress={onReview} />}
          <Pressable accessibilityRole={onContext ? 'button' : undefined} accessibilityLabel="Session details"
            disabled={!onContext} onPress={onContext} style={s.context}>
            <Icon name={shell ? 'terminal-outline' : 'code-slash-outline'} size={14} color={colors.muted} />
            <Text numberOfLines={1} style={[s.contextText, { color: colors.muted }]}>
              {contextLabel ?? (shell ? 'Terminal' : 'Coding agent')}
            </Text>
            {onContext && <Icon name="chevron-down" size={11} color={colors.muted} />}
          </Pressable>
        </View>}
        <Pressable onPress={() => working ? onStop?.() : void send()} disabled={working ? !onStop : !ready} accessibilityRole="button"
          accessibilityLabel={working ? 'Stop current task' : shell ? 'Send command and Enter' : 'Send prompt and Enter'}
          aria-disabled={working ? !onStop : !ready} aria-busy={sending} accessibilityState={{ disabled: working ? !onStop : !ready, busy: sending }}
          style={({ pressed }) => [s.send, { backgroundColor: ready ? colors.action : colors.elevated,
            opacity: pressed ? 0.65 : 1 }]}>
          {working ? <Icon name="stop" size={18} color={colors.text} /> : sending ? <ActivityIndicator color={colors.muted} /> :
            <Icon name="arrow-up" size={23} color={ready ? colors.onAction : colors.muted} />}
        </Pressable>
      </View>
    </View>
    {!compact && (!demo || (disabled && value.length > 0)) && <Text style={[s.caption, { color: colors.muted }]}>
      {disabled && value.length > 0 ? 'Your draft stays here until you can send it.'
        : 'Runs on your computer'}
    </Text>}
  </View>;
}
const s = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 5 },
  composer: { borderRadius: 27, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  input: { fontSize: 16, lineHeight: 24, minHeight: 60, maxHeight: 154, paddingHorizontal: 12,
    paddingTop: 11, paddingBottom: 10, outlineWidth: 0, outlineStyle: 'solid' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tools: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 1 },
  context: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, paddingRight: 6 },
  contextText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 10, lineHeight: 16, textAlign: 'center', paddingTop: 8, paddingHorizontal: 8 },
  compact: { flexDirection: 'row', alignItems: 'center', padding: 5, borderRadius: 20 },
  compactInput: { flex: 1, minHeight: 40, maxHeight: 54 },
});
