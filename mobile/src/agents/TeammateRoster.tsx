import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { font } from '../ui/font';
import { TeammateAvatar } from './TeammateAvatar';
import type { Teammate } from './types';

export const teammateStatus = (agent: Teammate) =>
  agent.archived
    ? 'Archived'
    : ({
        needs_approval: 'Needs your approval',
        queued: 'Getting ready',
        running: 'Working',
        waiting: 'Working with connected services',
        waiting_for_tool: 'Working on your computer',
        computer_offline: 'Waiting for your computer',
        reconciling: 'Checking outcome',
        cancelled: 'Stopped',
        failed: 'Task interrupted',
        completed: 'Finished',
        idle: 'Ready',
      }[agent.status] ?? 'Ready');
export function TeammateRoster({
  teammates,
  enabled,
  loading,
  onRefresh,
  onOpen,
  onCreate,
  compact = false,
}: {
  compact?: boolean;
  teammates: Teammate[];
  enabled: boolean;
  loading: boolean;
  onRefresh(): void;
  onOpen(agent: Teammate): void;
  onCreate(): void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const rows = teammates.filter(
    (a) =>
      a.archived === archived &&
      `${a.name} ${a.brief}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <View style={s.body}>
      {!compact && (
        <View style={s.intro}>
          <Text accessibilityRole="header" style={[s.heading, { color: colors.text }]}>
            Your teammates
          </Text>
          <Text style={[s.lede, { color: colors.muted }]}>
            One conversation for each person on your team.
          </Text>
        </View>
      )}
      <View style={[s.search, { backgroundColor: colors.elevated }]}>
        <Icon name="search" size={15} color={colors.muted} />
        <TextInput
          accessibilityLabel="Search teammates"
          placeholder="Search teammates"
          value={query}
          onChangeText={setQuery}
          placeholderTextColor={colors.muted}
          style={[s.searchInput, { color: colors.text }]}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        refreshing={loading}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.list}
        renderItem={({ item: a }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${a.name}, ${teammateStatus(a)}`}
            onPress={() => onOpen(a)}
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}
          >
            <TeammateAvatar avatar={a.avatar} size={42} />
            <View style={s.copy}>
              <View style={s.head}>
                <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>
                  {a.name}
                </Text>
                <Text style={[s.time, { color: colors.muted }]}>
                  {new Date(a.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <Text numberOfLines={1} style={[s.preview, { color: colors.muted }]}>
                {a.lastMessage || a.brief}
              </Text>
            </View>
            {(a.status === 'needs_approval' || a.unread) && (
              <View
                accessibilityLabel={
                  a.status === 'needs_approval' ? 'Needs your approval' : 'Unread'
                }
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: a.status === 'needs_approval' ? colors.warning : colors.accent,
                }}
              />
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Hint>
              {query
                ? 'No matching teammates.'
                : archived
                  ? 'No archived teammates.'
                  : loading
                    ? 'Loading teammates…'
                    : 'Give a teammate something to look after.'}
            </Hint>
            {!query && !archived && enabled && (
              <Button title="Create teammate" onPress={onCreate} />
            )}
          </View>
        }
        ListFooterComponent={
          teammates.some((a) => a.archived) || archived ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setArchived(!archived)}
              style={s.toggle}
            >
              <Text style={{ color: colors.muted }}>
                {archived ? 'Show active teammates' : 'Show archived teammates'}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
const s = StyleSheet.create({
  body: { flex: 1 },
  intro: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, gap: 4 },
  heading: { ...font.title },
  lede: { ...font.subhead },
  search: {
    minHeight: 40,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, minHeight: 40, fontSize: 15, letterSpacing: -0.2, outlineWidth: 0 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10, minHeight: 68 },
  copy: { flex: 1, gap: 3 },
  head: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  name: { ...font.row, fontSize: 16, fontWeight: '600', flex: 1 },
  time: { ...font.caption, fontWeight: '400' },
  preview: { ...font.subhead },
  empty: { paddingTop: 60, gap: 20, alignItems: 'center' },
  toggle: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
