import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useVibes } from './VibesProvider';

export function VibesDrawer({ onOpen }: { onOpen(): void }) {
  const { store, chats, selected } = useVibes(); const { colors } = useTheme();
  const select = (id: string | null) => { void store.select(id).catch(e => store.error(e)); onOpen(); };
  return <View style={s.section}>
    <Pressable accessibilityRole="button" onPress={() => select(null)} style={s.row}>
      <Icon name="sparkles-outline" size={18} color={colors.accent} /><Text style={[s.label, { color: colors.text }]}>New AI chat</Text></Pressable>
    {chats.slice(0, 20).map(chat => <Pressable key={chat.id} accessibilityRole="button"
      accessibilityLabel={'Open AI chat ' + chat.title} accessibilityState={{ selected: chat.id === selected }}
      onPress={() => select(chat.id)} style={[s.row, { backgroundColor: chat.id === selected ? colors.elevated : 'transparent' }]}>
      <Icon name="chatbubble-outline" size={16} color={colors.muted} /><Text numberOfLines={1} style={[s.label, { color: colors.text }]}>{chat.title}</Text>
    </Pressable>)}
  </View>;
}
const s = StyleSheet.create({ section: { marginBottom: 12 }, row: { minHeight: 48, paddingHorizontal: 14, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, label: { flex: 1, fontSize: 14 } });
