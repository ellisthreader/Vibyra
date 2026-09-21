import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import { TeammateAvatar } from './TeammateAvatar';
import type { Teammate } from './types';

export const teammateStatus = (agent: Teammate) => agent.archived ? 'Archived' : ({ needs_approval: 'Needs your approval',
  queued: 'Getting ready', running: 'Working', waiting: 'Working with connected services', reconciling: 'Checking outcome',
  cancelled: 'Stopped', failed: 'Task interrupted', completed: 'Finished', idle: 'Ready' }[agent.status] ?? 'Ready');
export function TeammateRoster({ teammates, enabled, loading, onRefresh, onOpen, onCreate, compact = false }: {
  compact?: boolean; teammates: Teammate[]; enabled: boolean; loading: boolean; onRefresh(): void; onOpen(agent: Teammate): void; onCreate(): void;
}) {
  const { colors } = useTheme(); const [query, setQuery] = useState(''); const [archived, setArchived] = useState(false);
  const rows = teammates.filter(a => a.archived === archived && `${a.name} ${a.brief}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <View style={s.body}>
    {!compact && <View style={s.intro}><Text style={[s.heading, { color: colors.text }]}>Your teammates</Text><Text style={{ color: colors.muted, fontFamily: 'DM Sans', fontSize: 12 }}>One conversation for each person on your team.</Text></View>}
    <TextInput accessibilityLabel="Search teammates" placeholder="Search teammates" value={query} onChangeText={setQuery}
      placeholderTextColor={colors.muted} style={[s.search, { color: colors.text, backgroundColor: colors.elevated }]} />
    <FlatList data={rows} keyExtractor={a => a.id} refreshing={loading} onRefresh={onRefresh} keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.list} renderItem={({ item: a }) => <Pressable accessibilityRole="button" accessibilityLabel={`${a.name}, ${teammateStatus(a)}`}
        onPress={() => onOpen(a)} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}>
        <TeammateAvatar avatar={a.avatar} size={34} />
        <View style={s.copy}><View style={s.head}><Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{a.name}</Text>
          <Text style={[s.time, { color: colors.muted }]}>{new Date(a.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></View>
          <Text numberOfLines={1} style={[s.preview, { color: colors.muted }]}>{a.lastMessage || a.brief}</Text>
        </View>{(a.status === 'needs_approval' || a.unread) && <View accessibilityLabel={a.status === 'needs_approval' ? 'Needs your approval' : 'Unread'} style={{width:5,height:5,borderRadius:3,backgroundColor:a.status === 'needs_approval' ? colors.warning : colors.accent}} />}
      </Pressable>}
      ListEmptyComponent={<View style={s.empty}><Hint>{query ? 'No matching teammates.' : archived ? 'No archived teammates.' : loading ? 'Loading teammates…' : 'Give a teammate something to look after.'}</Hint>
        {!query && !archived && enabled && <Button title="Create teammate" onPress={onCreate} />}</View>}
      ListFooterComponent={teammates.some(a => a.archived) || archived ? <Pressable accessibilityRole="button" onPress={() => setArchived(!archived)} style={s.toggle}>
        <Text style={{ color: colors.muted }}>{archived ? 'Show active teammates' : 'Show archived teammates'}</Text></Pressable> : null} />
  </View>;
}
const s = StyleSheet.create({ body: { flex: 1 }, intro: { padding: 20, gap: 10 }, heading: { fontFamily: 'DM Sans', fontSize: 23, fontWeight: '600', letterSpacing: -0.6 }, search: { minHeight: 40, marginHorizontal: 20, marginVertical: 10, borderRadius: 6, paddingHorizontal: 12, fontFamily: 'DM Sans', fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 24 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 68 },
  copy: { flex: 1, gap: 4 }, head: { flexDirection: 'row', gap: 8, alignItems: 'center' }, name: { flex: 1, fontFamily: 'DM Sans', fontSize: 13, fontWeight: '600' },
  time: { fontFamily: 'DM Sans', fontSize: 11 }, preview: { fontFamily: 'DM Sans', fontSize: 12, lineHeight: 18 }, status: { fontFamily: 'DM Sans', fontSize: 13, fontWeight: '600' },
  empty: { paddingTop: 60, gap: 20, alignItems: 'center' }, toggle: { minHeight: 44, justifyContent: 'center', alignItems: 'center' } });
