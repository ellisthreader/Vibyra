import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { memoryNotes } from './memoryChanges';
import type { VibesTurn } from './types';

/** Quiet, like the lines that say which integration answered; tapping one opens Settings > Memory. */
export function MemoryNotes({ turn, onOpen }: { turn: VibesTurn; onOpen?: () => void }) {
  const { colors } = useTheme();
  const notes = memoryNotes(turn);
  if (!notes.length) return null;
  return <View style={s.notes}>{notes.map(note => <Pressable key={note} disabled={!onOpen} onPress={onOpen}
    accessibilityRole={onOpen ? 'button' : 'text'} accessibilityLabel={onOpen ? `${note}. Manage memory` : note}
    style={({ pressed }) => [s.note, { opacity: pressed ? 0.6 : 1 }]}>
    <Icon name="bookmark-outline" size={15} color={colors.muted} />
    <Text selectable style={[s.text, { color: colors.muted }]}>{note}</Text>
  </Pressable>)}</View>;
}
const s = StyleSheet.create({
  notes: { gap: 6 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 24, paddingTop: 1 },
  text: { fontSize: 14, lineHeight: 21, flexShrink: 1 },
});
