import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import type { Session } from './types';

export type SessionFilter = 'All' | 'Chats' | 'Terminals';
export const sessionFilters: SessionFilter[] = ['All', 'Chats', 'Terminals'];
export const sessionKindLabel = (session: Session) =>
  session.kind === 'shell' ? 'Terminal' : session.kind === 'claude' ? 'Claude' : 'Codex';

export function FilterTabs({ filter, onChange }: {
  filter: SessionFilter; onChange: (value: SessionFilter) => void;
}) {
  const { colors } = useTheme();
  return <View accessibilityRole="tablist" style={[s.track, { borderBottomColor: colors.border }]}>
    {sessionFilters.map(item => {
      const selected = item === filter;
      return <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item}
        aria-selected={selected} accessibilityState={{ selected }} onPress={() => onChange(item)}
        style={({ pressed }) => [s.segment, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[s.segmentText, { color: selected ? colors.text : colors.muted }]}>{item}</Text>
        {selected && <View style={[s.underline, { backgroundColor: colors.accent }]} />}
      </Pressable>;
    })}
  </View>;
}

export function SessionRow({ session, project, selected, onPress }: {
  session: Session; project: string; selected: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  const terminal = session.kind === 'shell';
  const kind = sessionKindLabel(session);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${session.title}, ${kind}`}
    accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [s.row, { backgroundColor: selected || pressed ? colors.elevated : 'transparent' }]}>
    {selected && <View style={[s.selectedEdge, { backgroundColor: colors.accent }]} />}
    <View style={s.icon}>
      <Icon name={terminal ? 'terminal-outline' : 'chatbubble-outline'} size={19}
        color={selected ? colors.accent : colors.muted} />
    </View>
    <View style={s.body}>
      <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{session.title}</Text>
      <Text numberOfLines={1} style={[s.meta, { color: colors.muted }]}>{project ? `${kind} · ${project}` : kind}</Text>
    </View>
    {session.status === 'running' && <View style={[s.dot, { backgroundColor: colors.success }]} />}
  </Pressable>;
}

export function SessionsEmpty({ query, filter }: { query: string; filter: SessionFilter }) {
  const { colors } = useTheme();
  const title = query ? 'No results' : filter === 'Terminals' ? 'No terminals yet' : 'Your next idea starts here';
  const detail = query ? 'Try a different name or project.'
    : filter === 'Terminals' ? 'Terminals you open appear here.'
      : filter === 'Chats' ? 'Chats you start appear here.'
        : 'Start a new chat. Find it here anytime.';
  return <View style={s.empty}>
    <View style={[s.emptyTile, { backgroundColor: colors.elevated }]}>
      <Icon name={query ? 'search-outline' : filter === 'Terminals' ? 'terminal-outline' : 'chatbubble-outline'}
        size={23} color={colors.muted} />
    </View>
    <Text style={[s.emptyTitle, { color: colors.text }]}>{title}</Text>
    <Text style={[s.emptyText, { color: colors.muted }]}>{detail}</Text>
  </View>;
}
const s = StyleSheet.create({
  track: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  segment: { flex: 1, minHeight: 44, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  underline: { position: 'absolute', bottom: -1, height: 2, left: 8, right: 8, borderRadius: 1 },
  row: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectedEdge: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 2, borderRadius: 1 },
  icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 14.5, fontWeight: '500', letterSpacing: -0.2 },
  meta: { fontSize: 12, lineHeight: 16 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 36 },
  emptyTile: { width: 48, height: 48, borderRadius: 16, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600', textAlign: 'center', letterSpacing: -0.2 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
