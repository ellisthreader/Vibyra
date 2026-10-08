import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';

export function NewChatComposer({
  value,
  onChange,
  onSend,
  onPick,
  agent,
  note,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onPick: () => void;
  agent: string;
  note: string;
  busy?: boolean;
}) {
  const { colors, dark } = useTheme();
  const ready = Boolean(value.trim()) && !busy;
  return (
    <View style={s.dock}>
      <View style={[s.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          accessibilityLabel="Prompt for new chat"
          value={value}
          onChangeText={onChange}
          placeholder="What do you want to build?"
          placeholderTextColor={colors.muted}
          multiline
          keyboardAppearance={dark ? 'dark' : 'light'}
          autoCorrect={false}
          textAlignVertical="top"
          style={[s.input, { color: colors.text }]}
        />
        <View style={s.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose AI model"
            onPress={onPick}
            style={s.context}
          >
            <Icon name="sparkles-outline" size={15} color={colors.accent} />
            <Text numberOfLines={1} style={[s.agent, { color: colors.text }]}>
              {agent}
            </Text>
            <Icon name="chevron-down" size={12} color={colors.muted} />
          </Pressable>
          {/* Send starts the chat. It never opens a form: the picker above is the
            only place a choice is made, and Auto covers making none. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={onSend}
            style={[s.send, { backgroundColor: ready ? colors.action : colors.elevated }]}
          >
            <Icon name="arrow-up" size={20} color={ready ? colors.onAction : colors.muted} />
          </Pressable>
        </View>
      </View>
      <Text style={[s.note, { color: colors.muted }]}>{note}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  dock: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  composer: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 26,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  input: {
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: -0.2,
    minHeight: 56,
    maxHeight: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    outlineWidth: 0,
  },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 7,
    paddingHorizontal: 8,
    flexShrink: 1,
  },
  agent: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, flexShrink: 1 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  note: { textAlign: 'center', fontSize: 12, lineHeight: 16, paddingTop: 8, paddingBottom: 2 },
});
