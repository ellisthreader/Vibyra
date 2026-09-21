import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { confirmAction } from '../../ui/confirm';
import { Hint, Icon } from '../../ui/primitives';
import { MEMORY_MAX } from '../../vibes/preferencesApi';
import type { Personalization, PersonalizationState } from '../personalization';
import { Group, Label } from '../SettingsRows';

const COUNT_FROM = 180;

/**
 * The short memories: ones the person added, and ones a phone chat saved when asked
 * to remember something, marked so nothing on the list is a mystery. A memory leaves
 * on the tap and comes back if the server refuses; a new one appears only once saved.
 */
export function SavedMemories({ store, state, error, onFocusEnd, onTouch }: {
  store: Personalization; state: PersonalizationState; error: string | null; onFocusEnd: () => void; onTouch: () => void;
}) {
  const { colors } = useTheme();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const memories = state.memories ?? [];
  const add = async () => { onTouch(); if (await store.addMemory(text)) { setText(''); setAdding(false); } };
  const clear = () => {
    onTouch();
    confirmAction('Clear all memories?', 'Vibyra will forget everything on this list. This can’t be undone.',
      'Clear all', () => void store.clearMemories());
  };
  return <>
    <Label>{memories.length ? `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}` : 'Memories'}</Label>
    <Group>
      {memories.map(memory => <View key={memory.id} style={s.memory}>
        <View style={s.words}>
          <Text style={[s.memoryText, { color: colors.text }]}>{memory.text}</Text>
          {memory.source === 'chat' && <Text style={[s.source, { color: colors.muted }]}>From a chat</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove memory: ${memory.text}`} hitSlop={10}
          onPress={() => { onTouch(); void store.removeMemory(memory.id); }} style={({ pressed }) => [s.remove, { opacity: pressed ? 0.5 : 1 }]}>
          <Icon name="remove-circle-outline" size={22} color={colors.muted} />
        </Pressable>
      </View>)}
    </Group>
    <Group style={memories.length ? s.gap : undefined}>
      {adding ? <View style={s.addRow}>
        <TextInput autoFocus value={text} maxLength={MEMORY_MAX} accessibilityLabel="New memory" returnKeyType="done"
          placeholder="Something Vibyra should remember" placeholderTextColor={colors.muted} submitBehavior="submit"
          onChangeText={value => { setText(value); store.clearError(); }} onSubmitEditing={() => void add()}
          onFocus={() => setTimeout(onFocusEnd, 280)} style={[s.addInput, { color: colors.text }]} />
        {text.length >= COUNT_FROM && <Text style={[s.count, { color: colors.muted }]}>{MEMORY_MAX - text.length}</Text>}
        {/* An empty box offers Cancel rather than a disabled Add, so it never closes on a
            stray blur — the keyboard going away is not a decision to stop. */}
        {state.busy === 'add' ? <ActivityIndicator size="small" color={colors.muted} />
          : text.trim() ? <Pressable accessibilityRole="button" accessibilityLabel="Save memory" hitSlop={8} onPress={() => void add()}>
            <Text style={[s.save, { color: colors.accent }]}>Add</Text>
          </Pressable>
          : <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8} onPress={() => { setText(''); setAdding(false); store.clearError(); }}>
            <Text style={[s.save, { color: colors.muted }]}>Cancel</Text>
          </Pressable>}
      </View> : <Pressable accessibilityRole="button" accessibilityLabel="Add a memory" onPress={() => setAdding(true)}
        style={({ pressed }) => [s.addRow, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
        <View style={s.icon}><Icon name="add" size={22} color={colors.accent} /></View>
        <Text style={[s.addTitle, { color: colors.accent }]}>Add a memory</Text>
      </Pressable>}
    </Group>
    {error && <View style={s.error}><Hint error>{error}</Hint></View>}
    {memories.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear all memories" onPress={clear}
      disabled={state.busy === 'clear'} style={({ pressed }) => [s.clear, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[s.clearText, { color: colors.error }]}>Clear all memories</Text>
    </Pressable>}
  </>;
}
const s = StyleSheet.create({
  gap: { marginTop: 12 },
  memory: { minHeight: 50, paddingLeft: 16, paddingRight: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  words: { flex: 1, minWidth: 0, gap: 3 },
  memoryText: { fontSize: 15, lineHeight: 21 },
  source: { fontSize: 12 },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  addRow: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  addTitle: { flex: 1, fontSize: 16, letterSpacing: -0.2 },
  addInput: { flex: 1, minHeight: 44, fontSize: 16, padding: 0, outlineWidth: 0 } as object,
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  save: { fontSize: 15, fontWeight: '600' },
  error: { marginTop: 10, marginHorizontal: 2 },
  clear: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  clearText: { fontSize: 15, fontWeight: '500' },
});
