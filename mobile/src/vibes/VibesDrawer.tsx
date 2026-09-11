import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useVibes } from './VibesProvider';

// AI chats sit in the rail's one Recents list. Starting a new one is the pinned
// action in the corner, so this list is only ever titles.
export function VibesDrawer({ onOpen, query = '' }: { onOpen(): void; query?: string }) {
  const { store, chats, selected } = useVibes(); const { colors } = useTheme();
  const select = (id: string) => { void store.select(id).catch(e => store.error(e)); onOpen(); };
  const matches = chats.filter(chat => chat.title.toLowerCase().includes(query));
  if (!matches.length) {
    return query
      ? <Text style={[s.empty, { color: colors.muted }]}>No chats match “{query}”.</Text>
      : <Text style={[s.empty, { color: colors.muted }]}>Your chats appear here.</Text>;
  }
  return <View>
    {matches.slice(0, 20).map(chat => <Pressable key={chat.id} accessibilityRole="button"
      accessibilityLabel={'Open AI chat ' + chat.title} accessibilityState={{ selected: chat.id === selected }}
      onPress={() => select(chat.id)} style={({ pressed }) => [s.row,
        { backgroundColor: chat.id === selected || pressed ? colors.elevated : 'transparent' }]}>
      <Icon name="chatbubble-outline" size={17} color={chat.id === selected ? colors.accent : colors.muted} />
      <Text numberOfLines={1} style={[s.label, { color: colors.text }]}>{chat.title}</Text>
    </Pressable>)}
  </View>;
}
const s = StyleSheet.create({
  row: { minHeight: 48, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, fontSize: 14.5, fontWeight: '500', letterSpacing: -0.2 },
  empty: { fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 8 },
});
