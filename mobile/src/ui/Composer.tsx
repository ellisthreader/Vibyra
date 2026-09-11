import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, IconButton } from './primitives';

// `dense` is the terminal's box: one line to type into and the send button, with
// no toolbar repeating the project and session controls already on the screen.
export function Composer({ value, onChange, onSend, disabled, shell, compact = false, dense = false,
  contextLabel, onContext, onReview, onStop, working = false }: {
  value: string; onChange: (value: string) => void; onSend: (value: string) => Promise<boolean>;
  disabled: boolean; shell: boolean; compact?: boolean; dense?: boolean;
  contextLabel?: string; onContext?: () => void; onReview?: () => void;
  working?: boolean; onStop?: () => void;
}) {
  const { colors, dark } = useTheme();
  const web = Platform.OS === 'web';
  const row = compact || dense;
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const ready = !disabled && !sending && Boolean(value.trim());
  const send = async () => {
    if (!ready) return;
    setSending(true);
    const submitted = value;
    try { if (await onSend(submitted)) onChange(''); } finally { setSending(false); }
  };
  return <View style={[s.container, { backgroundColor: colors.background }, dense && s.denseContainer]}>
    <View style={[s.composer, { backgroundColor: colors.surface,
      borderColor: focused ? colors.muted : colors.border }, row && s.row, dense && s.denseComposer]}>
      <TextInput accessibilityLabel={shell ? 'Command for computer terminal' : 'Prompt for coding agent'}
        placeholder={shell ? 'Run a command…' : 'Ask Vibyra to build anything…'}
        placeholderTextColor={colors.muted} value={value} onChangeText={onChange} multiline
        editable={!sending} autoCorrect={false} autoCapitalize="none" spellCheck={false}
        // A browser textarea is two rows unless told otherwise; the terminal box
        // starts at one line and grows with the command, up to `maxHeight`.
        numberOfLines={dense && web ? 1 : undefined}
        // In a terminal the return key runs the command, the way every terminal
        // behaves. Multiline stays on so a pasted script still arrives whole.
        // The browser ignores submitBehavior, so there the key event is handled.
        returnKeyType={shell ? 'go' : undefined}
        submitBehavior={shell && !web ? 'submit' : 'newline'}
        onSubmitEditing={shell && !web ? () => void send() : undefined}
        onKeyPress={shell && web ? event => {
          const key = event.nativeEvent as { key?: string; shiftKey?: boolean };
          if (key.key !== 'Enter' || key.shiftKey) return;
          (event as { preventDefault?(): void }).preventDefault?.();
          void send();
        } : undefined}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} keyboardAppearance={dark ? 'dark' : 'light'}
        style={[s.input, { color: colors.text }, shell && s.shellInput, row && s.rowInput,
          dense && s.denseInput]} textAlignVertical="top" />
      <View style={s.toolbar}>
        {!row && <View style={s.tools}>
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
          style={({ pressed }) => [s.send, dense && s.denseSend, { backgroundColor: ready ? colors.action : colors.elevated,
            opacity: pressed ? 0.65 : 1 }]}>
          {working ? <Icon name="stop" size={dense ? 15 : 18} color={colors.text} /> : sending ? <ActivityIndicator color={colors.muted} /> :
            <Icon name="arrow-up" size={dense ? 19 : 23} color={ready ? colors.onAction : colors.muted} />}
        </Pressable>
      </View>
    </View>
    {!compact && disabled && value.length > 0 && <Text style={[s.caption, { color: colors.muted }]}>
      Your draft stays here until you can send it.
    </Text>}
  </View>;
}
const s = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 5 },
  composer: { borderRadius: 27, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  input: { fontSize: 16, lineHeight: 24, minHeight: 60, maxHeight: 154, paddingHorizontal: 12,
    paddingTop: 11, paddingBottom: 10, outlineWidth: 0, outlineStyle: 'solid' },
  shellInput: { minHeight: 30, paddingTop: 6, paddingBottom: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tools: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 1 },
  context: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, paddingRight: 6 },
  contextText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 10, lineHeight: 16, textAlign: 'center', paddingTop: 8, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', padding: 5, borderRadius: 20 },
  rowInput: { flex: 1, minHeight: 40, maxHeight: 54 },
  denseContainer: { paddingHorizontal: 12, paddingTop: 7, paddingBottom: 3 },
  denseComposer: { padding: 4, borderRadius: 19 },
  denseInput: { minHeight: 34, maxHeight: 108, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 7, fontSize: 15 },
  denseSend: { width: 34, height: 34, borderRadius: 17 },
});
